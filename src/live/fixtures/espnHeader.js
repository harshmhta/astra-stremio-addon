// ESPN's compact "scoreboard header" endpoint — the only reachable ESPN
// source for cricket (IPL league id 8048). Same headers as the scoreboard.
import { ESPN_HEADERS } from "./espn.js";

const URL_BASE = "https://site.web.api.espn.com/apis/v2/scoreboard/header";
const TTL_LIVE_MS = 60 * 1000;
const TTL_IDLE_MS = 15 * 60 * 1000;

const stateToStatus = (state) => (state === "in" ? "live" : state === "post" ? "final" : "upcoming");

function side(c) {
  if (!c) return null;
  return { name: c.displayName || c.name || "", short: c.abbreviation || "", logo: c.logo || null, score: c.score ?? null };
}

export function normalizeHeader(json, competition) {
  const out = [];
  for (const sport of json.sports || []) {
    for (const league of sport.leagues || []) {
      for (const e of league.events || []) {
        const comps = e.competitors || [];
        const home = comps.find((x) => x.homeAway === "home") || comps[0];
        const away = comps.find((x) => x.homeAway === "away") || comps[1];
        const state = e.fullStatus?.type?.state || e.status;
        out.push({
          id: `espn-header:${e.id}`,
          sport: competition.sport,
          competition: competition.id,
          competitionName: competition.name,
          logo: competition.logo,
          name: e.name || e.shortName || "",
          start: Date.parse(e.date),
          status: stateToStatus(state),
          clock: e.fullStatus?.summary || e.fullStatus?.type?.shortDetail || e.summary || null,
          home: side(home),
          away: side(away),
          broadcasts: (e.broadcasts || []).map((b) => b.shortName || b.name).filter(Boolean),
          sources: ["espn-header"],
          feeds: [],
        });
      }
    }
  }
  return out;
}

export function createEspnHeader({ fetchImpl = fetch, now = Date.now, log = (m) => console.error(m) } = {}) {
  const cache = new Map();
  return {
    async events(competition) {
      if (!competition?.espnHeader) return [];
      const { sport, league } = competition.espnHeader;
      const url = `${URL_BASE}?sport=${sport}&league=${league}`;
      const hit = cache.get(url);
      if (hit && now() - hit.at < (hit.value.some((e) => e.status === "live") ? TTL_LIVE_MS : TTL_IDLE_MS)) return hit.value;
      try {
        const res = await fetchImpl(url, { headers: ESPN_HEADERS, signal: AbortSignal.timeout(20_000) });
        if (!res.ok) throw new Error(`http ${res.status}`);
        const value = normalizeHeader(await res.json(), competition);
        cache.set(url, { at: now(), value });
        return value;
      } catch (err) {
        log(`[espn-header] ${competition.id}: ${err.message}`);
        cache.set(url, { at: now(), value: [] });
        return [];
      }
    },
  };
}
