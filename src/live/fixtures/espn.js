// ESPN public scoreboard on the host that still answers (site.web.api.espn.com).
// Unofficial: everything here degrades to [] on any failure.
const HOST = "https://site.web.api.espn.com/apis/site/v2/sports";
export const ESPN_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh) Chrome/128.0",
  Accept: "application/json",
  Referer: "https://www.espn.com/",
};
const TTL_LIVE_MS = 60 * 1000;
const TTL_IDLE_MS = 15 * 60 * 1000;

const F1_SESSIONS = { FP1: "Practice 1", FP2: "Practice 2", FP3: "Practice 3", Qual: "Qualifying", SQ: "Sprint Qualifying", Sprint: "Sprint", Race: "Race" };

const stateToStatus = (state) => (state === "in" ? "live" : state === "post" ? "final" : "upcoming");
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10).replaceAll("-", "");

function side(c) {
  if (!c) return null;
  const t = c.team || {};
  return { name: t.displayName || t.name || "", short: t.abbreviation || t.shortDisplayName || "", logo: t.logo || null, score: c.score ?? null };
}

function broadcastNames(c) {
  const names = new Set();
  for (const b of c.broadcasts || []) for (const n of b.names || []) names.add(n);
  for (const g of c.geoBroadcasts || []) if (g.media?.shortName) names.add(g.media.shortName);
  return [...names];
}

function base(competition, id, name, start, statusObj) {
  return {
    id: `espn:${id}`,
    sport: competition.sport,
    competition: competition.id,
    competitionName: competition.name,
    logo: competition.logo,
    name,
    start: Date.parse(start),
    status: stateToStatus(statusObj?.type?.state),
    clock: statusObj?.type?.shortDetail || null,
    sources: ["espn"],
    feeds: [],
  };
}

function normalizeF1(json, competition) {
  const out = [];
  for (const e of json.events || []) {
    const gp = String(e.name || "").replace(/^.*?\b(?=[A-Z][a-z]+ Grand Prix)/, "").trim() || e.shortName;
    (e.competitions || []).forEach((s, i) => {
      const abbr = s.type?.abbreviation || `S${i + 1}`;
      const sessionName = F1_SESSIONS[abbr] || abbr;
      out.push({
        ...base(competition, `${e.id}:${i}`, `${gp} · ${sessionName}`, s.date || e.date, s.status || e.status),
        home: { name: sessionName, short: abbr, logo: competition.logo, score: null },
        away: null,
        broadcasts: broadcastNames(s),
      });
    });
  }
  return out;
}

export function normalizeScoreboard(json, competition) {
  if (competition.sport === "f1") return normalizeF1(json, competition);
  const out = [];
  for (const e of json.events || []) {
    const c = (e.competitions || [])[0];
    if (!c) continue;
    const comps = c.competitors || [];
    const home = comps.find((x) => x.homeAway === "home") || comps[0];
    const away = comps.find((x) => x.homeAway === "away") || comps[1];
    out.push({
      ...base(competition, e.id, e.name || e.shortName || "", e.date, e.status || c.status),
      home: side(home),
      away: side(away),
      broadcasts: broadcastNames(c),
    });
  }
  return out;
}

export function createEspn({ fetchImpl = fetch, now = Date.now, log = (m) => console.error(m) } = {}) {
  const cache = new Map();
  return {
    async events(competition, fromMs, toMs) {
      if (!competition?.espn) return [];
      const { sport, league, groups } = competition.espn;
      const url = `${HOST}/${sport}/${league}/scoreboard?dates=${ymd(fromMs)}-${ymd(toMs)}&limit=400${groups ? `&groups=${groups}` : ""}`;
      const hit = cache.get(url);
      if (hit) {
        const ttl = hit.value.some((e) => e.status === "live") ? TTL_LIVE_MS : TTL_IDLE_MS;
        if (now() - hit.at < ttl) return hit.value;
      }
      try {
        const res = await fetchImpl(url, { headers: ESPN_HEADERS, signal: AbortSignal.timeout(20_000) });
        if (!res.ok) throw new Error(`http ${res.status}`);
        const value = normalizeScoreboard(await res.json(), competition);
        cache.set(url, { at: now(), value });
        return value;
      } catch (err) {
        log(`[espn] ${competition.id}: ${err.message}`);
        cache.set(url, { at: now(), value: [] });
        return [];
      }
    },
  };
}
