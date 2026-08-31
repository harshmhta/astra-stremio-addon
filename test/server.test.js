import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/server.js";

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));

const vodInfo = fx("vod-info");
const seriesInfo = fx("series-info");

const fakeXtream = {
  getVodStreams: async () => [fx("vod-item"), { stream_id: 2, name: "Second Movie", category_id: "531", container_extension: "mkv" }],
  getSeries: async () => [fx("series-item")],
  getVodCategories: async () => [{ category_id: "531", category_name: "TAMIL" }],
  getSeriesCategories: async () => [{ category_id: "164", category_name: "ISLAMIC" }],
  getVodInfo: async (id) => (String(id) === "385215" ? vodInfo : Promise.reject(new Error("nope"))),
  getSeriesInfo: async (id) => (String(id) === "11" ? seriesInfo : Promise.reject(new Error("nope"))),
  movieUrl: (id, ext) => `http://x:8080/movie/U/P/${id}.${ext}`,
  episodeUrl: (id, ext) => `http://x:8080/series/U/P/${id}.${ext}`,
  liveUrl: (id) => `http://x:8080/live/U/P/${id}.ts`,
  getLiveStreams: async () => [
    { stream_id: 777, name: "No Logo TV", category_id: "356", stream_icon: "" },
    liveItem,
    { stream_id: 999, name: "#### DIVIDER ####", category_id: "356" },
  ],
  getLiveCategories: async () => [{ category_id: "356", category_name: "SPORTS | CRICKET" }],
};

const liveItem = fx("live-item");

const fakeCinemeta = async (type, imdbId) => {
  if (imdbId === "tt0000001") return { name: "Alien: Romulus", year: 2024 };
  if (imdbId === "tt0000002") return { name: "Omar Series", year: null };
  throw new Error("cinemeta down");
};

const SECRET = "testsecret";
let baseUrl;
let server;

const fakeLogos = {
  ready: async () => {},
  resolve: (name) => (String(name).includes("No Logo") ? "https://fallback/nologo.png" : null),
};

test.before(async () => {
  const app = createApp({
    xtream: fakeXtream,
    cinemeta: fakeCinemeta,
    logos: fakeLogos,
    config: { secret: SECRET, addonName: "TEST VOD" },
  });
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

const get = async (path) => {
  const res = await fetch(baseUrl + path);
  return { status: res.status, cors: res.headers.get("access-control-allow-origin"), body: await res.json().catch(() => null) };
};

test("healthz works without secret", async () => {
  const r = await get("/healthz");
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true });
});

test("manifest served under secret, with catalogs and genres", async () => {
  const r = await get(`/${SECRET}/manifest.json`);
  assert.equal(r.status, 200);
  assert.equal(r.cors, "*");
  assert.equal(r.body.name, "TEST VOD");
  assert.deepEqual(r.body.types, ["movie", "series", "tv"]);
  const movies = r.body.catalogs.find((c) => c.id === "xc-movies");
  assert.equal(movies.type, "movie");
  assert.deepEqual(movies.extra.find((e) => e.name === "genre").options, ["TAMIL"]);
});

test("wrong secret is a 404", async () => {
  assert.equal((await get("/wrong/manifest.json")).status, 404);
});

test("movie catalog lists previews", async () => {
  const r = await get(`/${SECRET}/catalog/movie/xc-movies.json`);
  assert.equal(r.body.metas.length, 2);
  assert.equal(r.body.metas[0].id, "xc:v:385215:mp4");
});

test("catalog extra: search and skip", async () => {
  const s = await get(`/${SECRET}/catalog/movie/xc-movies/search=second.json`);
  assert.equal(s.body.metas.length, 1);
  assert.equal(s.body.metas[0].name, "Second Movie");
  const skipped = await get(`/${SECRET}/catalog/movie/xc-movies/skip=100.json`);
  assert.deepEqual(skipped.body.metas, []);
});

test("series catalog lists previews", async () => {
  const r = await get(`/${SECRET}/catalog/series/xc-series.json`);
  assert.equal(r.body.metas[0].id, "xc:s:11");
});

test("movie meta", async () => {
  const r = await get(`/${SECRET}/meta/movie/${encodeURIComponent("xc:v:385215:mp4")}.json`);
  assert.equal(r.body.meta.name, "Alien: Romulus (2024) (Tamil) (CAM)");
  assert.equal(r.body.meta.releaseInfo, "2024");
});

test("series meta has episode videos", async () => {
  const r = await get(`/${SECRET}/meta/series/${encodeURIComponent("xc:s:11")}.json`);
  assert.equal(r.body.meta.videos[0].id, "xc:e:130248:mp4");
});

test("movie stream url is exact", async () => {
  const r = await get(`/${SECRET}/stream/movie/${encodeURIComponent("xc:v:385215:mp4")}.json`);
  assert.equal(r.body.streams[0].url, "http://x:8080/movie/U/P/385215.mp4");
  assert.equal(r.body.streams[0].behaviorHints.notWebReady, true);
});

test("episode stream url is exact", async () => {
  const r = await get(`/${SECRET}/stream/series/${encodeURIComponent("xc:e:130248:mkv")}.json`);
  assert.equal(r.body.streams[0].url, "http://x:8080/series/U/P/130248.mkv");
});

test("unknown id kinds are 404 (except tt streams, which degrade to empty)", async () => {
  assert.equal((await get(`/${SECRET}/meta/movie/tt123.json`)).status, 404);
  assert.equal((await get(`/${SECRET}/stream/movie/garbage.json`)).status, 404);
});

test("upstream failure surfaces as 502", async () => {
  assert.equal((await get(`/${SECRET}/meta/movie/${encodeURIComponent("xc:v:999:mp4")}.json`)).status, 502);
});

test("manifest declares tt support for streams only", async () => {
  const r = await get(`/${SECRET}/manifest.json`);
  const stream = r.body.resources.find((x) => x.name === "stream");
  assert.deepEqual(stream.idPrefixes, ["xc:", "tt"]);
  const meta = r.body.resources.find((x) => x.name === "meta");
  assert.deepEqual(meta.idPrefixes, ["xc:"]);
});

test("imdb movie id resolves to matching iptv streams", async () => {
  const r = await get(`/${SECRET}/stream/movie/tt0000001.json`);
  assert.equal(r.status, 200);
  assert.equal(r.body.streams.length, 1);
  assert.equal(r.body.streams[0].url, "http://x:8080/movie/U/P/385215.mp4");
  assert.ok(r.body.streams[0].description.includes("Alien: Romulus"));
});

test("imdb episode id resolves via series info", async () => {
  const r = await get(`/${SECRET}/stream/series/${encodeURIComponent("tt0000002:1:1")}.json`);
  assert.equal(r.body.streams[0].url, "http://x:8080/series/U/P/130248.mp4");
});

test("imdb id with no episode match returns empty streams", async () => {
  const r = await get(`/${SECRET}/stream/series/${encodeURIComponent("tt0000002:9:9")}.json`);
  assert.deepEqual(r.body.streams, []);
});

test("cinemeta failure degrades to empty streams, not an error", async () => {
  const r = await get(`/${SECRET}/stream/movie/tt9999999.json`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.streams, []);
});

test("live catalog hides dividers and fills missing logos from the resolver", async () => {
  const r = await get(`/${SECRET}/catalog/tv/xc-live.json`);
  assert.equal(r.body.metas.length, 2);
  const noLogo = r.body.metas.find((m) => m.name === "No Logo TV");
  assert.equal(noLogo.poster, "https://fallback/nologo.png");
  const star = r.body.metas.find((m) => m.id === "xc:l:98867");
  assert.equal(star.poster, "https://i.ibb.co/p4knk5y/images-4.png", "panel logo wins when present");
});

test("live meta uses the fallback logo too", async () => {
  const r = await get(`/${SECRET}/meta/tv/${encodeURIComponent("xc:l:777")}.json`);
  assert.equal(r.body.meta.logo, "https://fallback/nologo.png");
});

test("manifest includes tv type and live catalog", async () => {
  const r = await get(`/${SECRET}/manifest.json`);
  assert.deepEqual(r.body.types, ["movie", "series", "tv"]);
  const live = r.body.catalogs.find((c) => c.id === "xc-live");
  assert.equal(live.type, "tv");
  assert.deepEqual(live.extra.find((e) => e.name === "genre").options, ["SPORTS | CRICKET"]);
});

test("live meta resolves from the cached channel list", async () => {
  const r = await get(`/${SECRET}/meta/tv/${encodeURIComponent("xc:l:98867")}.json`);
  assert.equal(r.body.meta.logo, "https://i.ibb.co/p4knk5y/images-4.png");
  assert.deepEqual(r.body.meta.genres, ["SPORTS | CRICKET"]);
  assert.equal((await get(`/${SECRET}/meta/tv/${encodeURIComponent("xc:l:404404")}.json`)).status, 404);
});

test("live stream url is exact and has no bingeGroup", async () => {
  const r = await get(`/${SECRET}/stream/tv/${encodeURIComponent("xc:l:98867")}.json`);
  assert.equal(r.body.streams[0].url, "http://x:8080/live/U/P/98867.ts");
  assert.equal("bingeGroup" in r.body.streams[0].behaviorHints, false);
});

test("episode streams carry a bingeGroup for auto-next", async () => {
  const xc = await get(`/${SECRET}/stream/series/${encodeURIComponent("xc:e:130248:mkv")}.json`);
  assert.equal(xc.body.streams[0].behaviorHints.bingeGroup, "northstar-series");
  const tt = await get(`/${SECRET}/stream/series/${encodeURIComponent("tt0000002:1:1")}.json`);
  assert.equal(tt.body.streams[0].behaviorHints.bingeGroup, "northstar-s11");
});
