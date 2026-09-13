import express from "express";
import {
  vodToPreview,
  seriesToPreview,
  vodInfoToMeta,
  seriesInfoToMeta,
  liveToPreview,
  liveToMeta,
  isRealChannel,
  parseId,
} from "./mappers.js";
import { buildCatalog, genreOptions } from "./catalog.js";
import { createImdbMatcher, createCinemetaClient, parseCinemetaId } from "./imdb.js";
import { createLogoResolver } from "./logos.js";
import { createLiveRouter } from "./live/api.js";

const MANIFEST_ID = "cc.harsh.xtream-vod";
const MAX_SERIES_INFO_LOOKUPS = 3;

export function createApp({ xtream, config, cinemeta = createCinemetaClient(), logos = createLogoResolver(), live = null }) {
  const imdb = createImdbMatcher();
  const liveTv = config.liveTv !== false; // LIVE_TV=false hides the live catalog entirely

  // Live channels enriched with fallback logos + sorted logo-first, memoized
  // on the xtream list object (which only changes when its cache refreshes).
  let liveSource = null;
  let liveEnriched = null;
  async function liveChannels() {
    const raw = await xtream.getLiveStreams();
    if (raw === liveSource) return liveEnriched;
    await logos.ready();
    const channels = raw.filter(isRealChannel).map((c) => {
      if (c.stream_icon) return c;
      const fallback = logos.resolve(c.name);
      return fallback ? { ...c, stream_icon: fallback } : c;
    });
    channels.sort((a, b) => (b.stream_icon ? 1 : 0) - (a.stream_icon ? 1 : 0));
    liveSource = raw;
    liveEnriched = channels;
    return channels;
  }
  const app = express();
  app.disable("x-powered-by");

  app.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "*");
    next();
  });

  app.get("/healthz", (req, res) => res.json({ ok: true }));

  const secret = express.Router();
  app.use(`/${config.secret}`, secret);

  // Live/Sports API for the Astra TV app — separate from the Stremio routes,
  // never referenced by the manifest.
  if (live && config.liveApi !== false) secret.use("/api/v1", createLiveRouter({ engine: live }));

  secret.get("/manifest.json", async (req, res, next) => {
    try {
      const [vodCats, seriesCats, liveCats] = await Promise.all([
        xtream.getVodCategories(),
        xtream.getSeriesCategories(),
        liveTv ? xtream.getLiveCategories() : [],
      ]);
      const types = liveTv ? ["movie", "series", "tv"] : ["movie", "series"];
      const catalogExtra = (cats) => [
        { name: "genre", options: genreOptions(cats) },
        { name: "search" },
        { name: "skip" },
      ];
      res.json({
        id: MANIFEST_ID,
        version: "1.4.0",
        name: config.addonName,
        description: liveTv
          ? "Private VOD + live TV addon backed by an Xtream Codes IPTV subscription"
          : "Private VOD addon backed by an Xtream Codes IPTV subscription",
        types,
        resources: [
          "catalog",
          { name: "meta", types, idPrefixes: ["xc:"] },
          { name: "stream", types, idPrefixes: ["xc:", "tt"] },
        ],
        catalogs: [
          { type: "movie", id: "xc-movies", name: "IPTV Movies", extra: catalogExtra(vodCats) },
          { type: "series", id: "xc-series", name: "IPTV Series", extra: catalogExtra(seriesCats) },
          ...(liveTv ? [{ type: "tv", id: "xc-live", name: "Live TV", extra: catalogExtra(liveCats) }] : []),
        ],
        behaviorHints: { configurable: false },
      });
    } catch (err) {
      next(err);
    }
  });

  const parseExtra = (segment) => Object.fromEntries(new URLSearchParams(segment || ""));

  const catalogHandler = async (req, res, next) => {
    try {
      const { type } = req.params;
      const extra = parseExtra(req.params.extra);
      if (type === "movie" && req.params.catalogId === "xc-movies") {
        const [items, categories] = await Promise.all([xtream.getVodStreams(), xtream.getVodCategories()]);
        return res.json(buildCatalog({ items, categories, extra, toPreview: vodToPreview }));
      }
      if (type === "series" && req.params.catalogId === "xc-series") {
        const [items, categories] = await Promise.all([xtream.getSeries(), xtream.getSeriesCategories()]);
        return res.json(buildCatalog({ items, categories, extra, toPreview: seriesToPreview }));
      }
      if (liveTv && type === "tv" && req.params.catalogId === "xc-live") {
        const [items, categories] = await Promise.all([liveChannels(), xtream.getLiveCategories()]);
        return res.json(buildCatalog({ items, categories, extra, toPreview: liveToPreview }));
      }
      res.status(404).json({ err: "not found" });
    } catch (err) {
      next(err);
    }
  };
  secret.get("/catalog/:type/:catalogId.json", catalogHandler);
  secret.get("/catalog/:type/:catalogId/:extra.json", catalogHandler);

  secret.get("/meta/:type/:id.json", async (req, res, next) => {
    try {
      const parsed = parseId(req.params.id);
      if (!parsed) return res.status(404).json({ err: "not found" });
      if (parsed.kind === "movie") {
        const data = await xtream.getVodInfo(parsed.streamId);
        return res.json({ meta: vodInfoToMeta(req.params.id, data.info, data.movie_data) });
      }
      if (parsed.kind === "series") {
        const data = await xtream.getSeriesInfo(parsed.seriesId);
        return res.json({ meta: seriesInfoToMeta(parsed.seriesId, data.info, data.episodes) });
      }
      if (parsed.kind === "live" && liveTv) {
        const [items, categories] = await Promise.all([liveChannels(), xtream.getLiveCategories()]);
        const item = items.find((it) => String(it.stream_id) === parsed.streamId);
        if (!item) return res.status(404).json({ err: "not found" });
        return res.json({ meta: liveToMeta(item, categories) });
      }
      res.status(404).json({ err: "not found" });
    } catch (err) {
      next(err);
    }
  });

  const toStream = (url, description, bingeGroup) => ({
    name: config.addonName,
    description,
    url,
    behaviorHints: { notWebReady: true, ...(bingeGroup ? { bingeGroup } : {}) },
  });

  async function imdbStreams(type, id) {
    const cinemetaId = parseCinemetaId(id);
    if (!cinemetaId) return null;
    try {
      const wanted = await cinemeta(type, cinemetaId.imdbId);
      if (type === "movie") {
        const items = imdb.matchMovies(await xtream.getVodStreams(), wanted);
        return items.map((it) =>
          toStream(xtream.movieUrl(it.stream_id, it.container_extension || "mp4"), it.name),
        );
      }
      const matches = imdb.matchSeries(await xtream.getSeries(), wanted).slice(0, MAX_SERIES_INFO_LOOKUPS);
      const streams = [];
      for (const s of matches) {
        const data = await xtream.getSeriesInfo(s.series_id).catch(() => null);
        for (const [seasonKey, eps] of Object.entries(data?.episodes || {})) {
          if (Number(seasonKey) !== cinemetaId.season) continue;
          for (const ep of eps || []) {
            if (Number(ep.episode_num) !== cinemetaId.episode || ep.id == null) continue;
            streams.push(toStream(xtream.episodeUrl(ep.id, ep.container_extension || "mp4"), s.name, `northstar-s${s.series_id}`));
          }
        }
      }
      return streams;
    } catch (err) {
      console.error(`[imdb] ${type}/${id}: ${err.message}`);
      return []; // never block other addons' streams on our failure
    }
  }

  secret.get("/stream/:type/:id.json", async (req, res, next) => {
    try {
      const parsed = parseId(req.params.id);
      const stream = (url, bingeGroup) => ({ streams: [toStream(url, "Direct from IPTV provider", bingeGroup)] });
      if (parsed?.kind === "movie") return res.json(stream(xtream.movieUrl(parsed.streamId, parsed.ext)));
      if (parsed?.kind === "episode") return res.json(stream(xtream.episodeUrl(parsed.episodeId, parsed.ext), "northstar-series"));
      if (parsed?.kind === "live" && liveTv) return res.json(stream(xtream.liveUrl(parsed.streamId)));
      const viaImdb = await imdbStreams(req.params.type, req.params.id);
      if (viaImdb) return res.json({ streams: viaImdb });
      res.status(404).json({ err: "not found" });
    } catch (err) {
      next(err);
    }
  });

  app.use((req, res) => res.status(404).json({ err: "not found" }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    // never write the secret path segment into logs
    const path = req.path.split(config.secret).join("[secret]");
    console.error(`[upstream] ${req.method} ${path}: ${err.message}`);
    res.status(502).json({ err: "upstream" });
  });

  return app;
}
