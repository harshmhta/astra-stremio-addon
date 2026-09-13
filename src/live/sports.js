// The sports engine: fixtures from the internet, feeds from the panel.
import { SPORTS, COMPETITIONS, TEAMS, teamById, competitionById, matchTeams } from "./taxonomy.js";
import { buildChannelIndex } from "./channels.js";
import { attachFeeds, durationMs, rankFeeds, feedLabel } from "./ranking.js";
import { teamKey } from "./events.js";

const H = 3600 * 1000;
const PAST_WINDOW_MS = 6 * H;
const MERGE_TOLERANCE_MS = 20 * 60 * 1000;
const FIXTURE_CACHE_MS = 20 * 1000;
const CHANNELS_PER_ROW = 10;

function sameTeamName(a, b) {
  const ka = teamKey(a);
  const kb = teamKey(b);
  if (!ka || !kb) return false;
  return ka === kb || (Math.min(ka.length, kb.length) >= 4 && (ka.includes(kb) || kb.includes(ka)));
}

function samePair(a, b) {
  const ah = a.home?.name, aa = a.away?.name, bh = b.home?.name, ba = b.away?.name;
  if (!aa || !ba) return sameTeamName(ah, bh) && !aa && !ba;
  return (sameTeamName(ah, bh) && sameTeamName(aa, ba)) || (sameTeamName(ah, ba) && sameTeamName(aa, bh));
}

const rank = (e) => (e.sources.includes("espn") ? 0 : e.sources.includes("espn-header") ? 1 : 2);

function mergeInto(list, incoming) {
  const i = list.findIndex((e) => e.sport === incoming.sport && Math.abs(e.start - incoming.start) <= MERGE_TOLERANCE_MS && samePair(e, incoming));
  if (i === -1) { list.push({ ...incoming, sources: [...incoming.sources] }); return; }
  const [primary, secondary] = rank(incoming) < rank(list[i]) ? [incoming, list[i]] : [list[i], incoming];
  const fill = (p, s) => ({ ...p, logo: p.logo || s.logo, home: { ...p.home, logo: p.home?.logo || s.home?.logo, score: p.home?.score ?? s.home?.score }, away: p.away && { ...p.away, logo: p.away?.logo || s.away?.logo, score: p.away?.score ?? s.away?.score } });
  list[i] = { ...fill(primary, secondary), broadcasts: [...new Set([...(primary.broadcasts || []), ...(secondary.broadcasts || [])])], sources: [...new Set([...primary.sources, ...secondary.sources])] };
}

export function createSportsEngine({ xtream, epg, espn, espnHeader, sportsDb, config = {}, now = Date.now, log = (m) => console.error(m) }) {
  const regionOrder = config.regionOrder || ["UK", "US", "IN", "CA", "other"];
  const defaultTeams = config.teams || TEAMS.map((t) => t.id);
  const windowMs = (config.windowHours || 48) * H;

  let channelsSource = null;
  let channelIndex = null;
  async function channels() {
    const raw = await xtream.getLiveStreams();
    if (raw === channelsSource) return channelIndex;
    const cats = await xtream.getLiveCategories();
    channelIndex = buildChannelIndex(raw, cats, (id) => xtream.liveUrl(id));
    channelsSource = raw;
    return channelIndex;
  }

  const fixtureCache = new Map(); // teams key → { at, value }
  async function fixtures(teamIds) {
    const key = [...teamIds].sort().join(",");
    const hit = fixtureCache.get(key);
    if (hit && now() - hit.at < FIXTURE_CACHE_MS) return hit.value;
    const t = now();
    const from = t - PAST_WINDOW_MS;
    const to = t + windowMs;
    const jobs = [];
    for (const comp of COMPETITIONS) {
      if (comp.espn) jobs.push(espn.events(comp, from, to));
      if (comp.espnHeader) jobs.push(espnHeader.events(comp));
    }
    for (const id of teamIds) {
      const team = teamById(id);
      if (team?.tsdbId) jobs.push(sportsDb.nextEvent(team.tsdbId), sportsDb.lastEvent(team.tsdbId));
    }
    const results = await Promise.all(jobs.map((p) => p.catch((err) => { log(`[sports] source failed: ${err.message}`); return []; })));
    const merged = [];
    for (const list of results) for (const e of list) if (Number.isFinite(e.start) && e.start >= from && e.start <= to) mergeInto(merged, e);
    const value = merged.map((e) => refineStatus(e, t)).sort((a, b) => a.start - b.start);
    fixtureCache.set(key, { at: t, value });
    return value;
  }

  function refineStatus(e, t) {
    const end = e.start + durationMs(e.sport);
    let status = e.status;
    if (status === "upcoming" && t >= e.start && t < end) status = "live";
    if (status === "live" && t > end + H) status = "final";
    if (status === "final" && !e.sources.includes("espn") && t < e.start) status = "upcoming";
    return { ...e, status };
  }

  function annotate(e, teamIds) {
    const text = `${e.home?.name || ""} vs ${e.away?.name || ""} ${e.name || ""}`;
    const ids = matchTeams(text, e.sport);
    return { ...e, isMyTeam: ids.some((id) => teamIds.includes(id)), myTeamIds: ids.filter((id) => teamIds.includes(id)) };
  }

  async function withFeeds(teamIds) {
    const [chans, evs] = await Promise.all([channels(), fixtures(teamIds)]);
    await epg.ready();
    const t = now();
    return evs.map((e) => attachFeeds(annotate(e, teamIds), { channels: chans, epg, regionOrder, now: t }));
  }

  function channelRows(chans) {
    const rows = [];
    for (const sport of SPORTS) {
      const wanted = new Set();
      for (const c of COMPETITIONS) if (c.sport === sport) for (const ids of Object.values(c.networks)) for (const id of ids) wanted.add(id);
      const feeds = chans.filter((c) => !c.isEvent && c.network && wanted.has(c.network)).map((c) => ({ streamId: c.streamId, url: c.url, label: null, channelName: c.name, region: c.region, quality: c.quality, kind: "network", logo: c.logo, network: c.network }));
      const ranked = rankFeeds(feeds, regionOrder);
      const seen = new Set();
      const unique = ranked.filter((f) => (seen.has(f.network) ? false : seen.add(f.network))).slice(0, CHANNELS_PER_ROW);
      if (unique.length) rows.push({ sport, feeds: unique });
    }
    return rows;
  }

  return {
    async home(teamIds = defaultTeams) {
      const evs = await withFeeds(teamIds);
      const t = now();
      const mine = evs.filter((e) => e.isMyTeam);
      const sports = SPORTS.map((sport) => ({ sport, live: evs.filter((e) => e.sport === sport && e.status === "live") })).filter((r) => r.live.length);
      const chans = await channels();
      return {
        myTeams: {
          live: mine.filter((e) => e.status === "live"),
          upcoming: mine.filter((e) => e.status === "upcoming"),
          recent: mine.filter((e) => e.status === "final" && t - e.start < PAST_WINDOW_MS + durationMs(e.sport)),
        },
        sports,
        channels: channelRows(chans).map((r) => ({ sport: r.sport, feeds: r.feeds.map((f) => ({ ...f, label: labelFor(f) })) })),
        generatedAt: new Date(t).toISOString(),
      };
    },
    async events({ sport = null, teams = defaultTeams } = {}) {
      const evs = await withFeeds(teams);
      return sport ? evs.filter((e) => e.sport === sport) : evs;
    },
    async event(id, teams = defaultTeams) {
      const evs = await withFeeds(teams);
      return evs.find((e) => e.id === id) || null;
    },
    async channels({ sport = null } = {}) {
      const rows = channelRows(await channels()).map((r) => ({ sport: r.sport, feeds: r.feeds.map((f) => ({ ...f, label: labelFor(f) })) }));
      return sport ? rows.filter((r) => r.sport === sport) : rows;
    },
    teams() {
      return TEAMS.map((t) => ({ id: t.id, name: t.name, sport: t.sport, badge: t.badge, competitions: t.competitions.map((c) => competitionById(c)?.name).filter(Boolean) }));
    },
  };
}

const labelFor = (f) => feedLabel({ network: f.network, name: f.channelName });
