// TheSportsDB v1 free tier (key "3"). Lists are truncated on the free
// tier, so this is only used for per-team next/last match and badges.
import { matchCompetition } from "../taxonomy.js";

const BASE = "https://www.thesportsdb.com/api/v1/json/3";
const TTL_MS = 6 * 3600 * 1000;
const LIVE_WINDOW_MS = 8 * 3600 * 1000;

const SPORT_MAP = { cricket: "cricket", soccer: "soccer", "american football": "nfl", basketball: "nba", baseball: "mlb", motorsport: "f1", tennis: "tennis" };
const FINISHED = /finished|^ft$|^aet$|^pen$|complete|result/i;

function startOf(raw) {
  if (raw.strTimestamp) return Date.parse(raw.strTimestamp.endsWith("Z") ? raw.strTimestamp : raw.strTimestamp + "Z");
  if (raw.dateEvent) return Date.parse(`${raw.dateEvent}T${raw.strTime || "00:00:00"}Z`);
  return NaN;
}

export function normalizeTsdbEvent(raw, nowMs = Date.now()) {
  const start = startOf(raw);
  const sport = SPORT_MAP[String(raw.strSport || "").toLowerCase()] || "soccer";
  let status = "upcoming";
  if (FINISHED.test(raw.strStatus || "") || (raw.intHomeScore != null && raw.intAwayScore != null && nowMs > start + LIVE_WINDOW_MS)) status = "final";
  else if (nowMs >= start && nowMs < start + LIVE_WINDOW_MS) status = "live";
  const competition = matchCompetition(`${raw.strLeague || ""} ${raw.strEvent || ""}`) || (sport === "cricket" ? "cricket-international" : null);
  return {
    id: `tsdb:${raw.idEvent}`,
    sport,
    competition,
    competitionName: raw.strLeague || null,
    logo: null,
    name: raw.strEvent || `${raw.strHomeTeam} vs ${raw.strAwayTeam}`,
    start,
    status,
    clock: raw.strStatus || null,
    home: { name: raw.strHomeTeam || "", short: "", logo: raw.strHomeTeamBadge || null, score: raw.intHomeScore ?? null },
    away: { name: raw.strAwayTeam || "", short: "", logo: raw.strAwayTeamBadge || null, score: raw.intAwayScore ?? null },
    broadcasts: [],
    sources: ["tsdb"],
    feeds: [],
  };
}

export function createSportsDb({ fetchImpl = fetch, now = Date.now, log = (m) => console.error(m) } = {}) {
  const cache = new Map();
  async function getJson(url) {
    const hit = cache.get(url);
    if (hit && now() - hit.at < TTL_MS) return hit.value;
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const value = await res.json();
      cache.set(url, { at: now(), value });
      return value;
    } catch (err) {
      log(`[tsdb] ${url}: ${err.message}`);
      cache.set(url, { at: now(), value: null });
      return null;
    }
  }
  const toEvents = (list) => (Array.isArray(list) ? list : []).filter((r) => r && r.idEvent).map((r) => normalizeTsdbEvent(r, now()));
  return {
    async nextEvent(teamId) {
      const data = await getJson(`${BASE}/eventsnext.php?id=${teamId}`);
      return toEvents(data?.events);
    },
    async lastEvent(teamId) {
      const data = await getJson(`${BASE}/eventslast.php?id=${teamId}`);
      return toEvents(data?.results);
    },
    async badge(teamName) {
      const data = await getJson(`${BASE}/searchteams.php?t=${encodeURIComponent(String(teamName).replace(/\s+/g, "_"))}`);
      return data?.teams?.[0]?.strBadge || null;
    },
  };
}
