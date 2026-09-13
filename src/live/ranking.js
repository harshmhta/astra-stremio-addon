// Attaches panel feeds to a fixture and ranks them by evidence → region → quality.
import { networkOf } from "./networks.js";
import { competitionById, matchTeams } from "./taxonomy.js";
import { parseEventName, matchesFixture, teamKey } from "./events.js";

const MAX_FEEDS = 12;
const KIND_RANK = { epg: 0, network: 1, event: 2 };
const QUALITY_RANK = { "4k": 0, fhd: 1, hd: 2, sd: 3 };
const PRE_ROLL_MS = 15 * 60 * 1000;

const DURATIONS_H = { soccer: 2, "college-football": 3.5, nfl: 3.5, nba: 2.5, mlb: 3.5, cricket: 8, tennis: 3, f1: 2 };
export const durationMs = (sport) => (DURATIONS_H[sport] ?? 3) * 3600 * 1000;

const LABELS = {
  "espn-plus": "ESPN+", espn: "ESPN", espn2: "ESPN2", espnu: "ESPNU", "espn-deportes": "ESPN Deportes", fs1: "FS1", fs2: "FS2",
  nbc: "NBC", nbcsn: "NBCSN", cbs: "CBS", abc: "ABC", fox: "FOX", itv: "ITV", tbs: "TBS", trutv: "truTV", tnt: "TNT",
  "usa-network": "USA Network", "cbs-sports-network": "CBS Sports Network", "big-ten-network": "Big Ten Network", "sec-network": "SEC Network",
  "nfl-network": "NFL Network", "nba-tv": "NBA TV", "mlb-network": "MLB Network", "bbc-one": "BBC One", "bbc-two": "BBC Two",
  dazn: "DAZN", willow: "Willow", paramount: "Paramount+",
};

export function feedLabel(channel) {
  if (channel.network) {
    if (LABELS[channel.network]) return LABELS[channel.network];
    return channel.network
      .split("-")
      .map((w) => (/^(tnt|bbc|itv|nfl|nba|mlb|f1|fhd)$/i.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
      .join(" ");
  }
  const name = String(channel.name || "");
  // "CA-DAZN 3: Premier League| … " → "DAZN 3"
  const provider = /^[A-Z]{2}-([A-Z][A-Za-z]+ \d+):/.exec(name);
  if (provider) return provider[1];
  // "DSTV: SuperSport 3 (FHD)" → "SuperSport 3"; "UK || SKY SPORTS PLUS" → "SKY SPORTS PLUS"
  const stripped = name.replace(/^[A-Za-z]{2,5}\s*(?:[:|]{1,2}|-)\s*/, "");
  const first = stripped.split("|")[0] || stripped;
  return first.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim() || name;
}

export function broadcastToNetworks(name) {
  const id = networkOf(name);
  return id ? [id] : [];
}

const toFeed = (c, kind) => ({ streamId: c.streamId, url: c.url, label: feedLabel(c), channelName: c.name, region: c.region, quality: c.quality, kind, logo: c.logo, network: c.network });

// Words that don't identify a club on their own ("City", "United", "Real"…).
const GENERIC_WORDS = new Set(["city", "united", "town", "albion", "hove", "athletic", "rovers", "wanderers", "county", "real", "club", "state", "university", "sports", "team", "cricket", "fc", "the", "and", "nittany", "lions", "ducks", "hurricanes", "tigers", "bulldogs", "wildcats", "spurs"]);
export function teamTokens(name) {
  return teamKey(name).split(" ").filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w));
}

function titleMentionsTeam(title, event) {
  const words = new Set(teamKey(title).split(" "));
  const names = [event.home?.name, event.away?.name].filter(Boolean);
  if (names.some((n) => teamTokens(n).some((tok) => words.has(tok)))) return true;
  const teamIds = matchTeams(title, event.sport);
  return teamIds.length > 0 && names.some((n) => matchTeams(n, event.sport).some((id) => teamIds.includes(id)));
}

const PREPARED = new WeakMap(); // channels array → { at, eventChannels, epgChannels, byNetwork }
const PREPARE_TTL_MS = 60 * 60 * 1000;
function prepare(channels, now) {
  const hit = PREPARED.get(channels);
  if (hit && now - hit.at < PREPARE_TTL_MS) return hit;
  const prepared = { at: now, eventChannels: [], epgChannels: [], byNetwork: new Map() };
  for (const c of channels) {
    if (c.isEvent) {
      const parsed = parseEventName(c.name, now);
      if (parsed) prepared.eventChannels.push({ c, parsed });
      continue;
    }
    if (c.epgId) prepared.epgChannels.push(c);
    if (c.network) {
      const list = prepared.byNetwork.get(c.network);
      if (list) list.push(c);
      else prepared.byNetwork.set(c.network, [c]);
    }
  }
  PREPARED.set(channels, prepared);
  return prepared;
}

export function attachFeeds(event, { channels, epg, regionOrder, now = Date.now() }) {
  const competition = competitionById(event.competition);
  const prepared = prepare(channels, now);
  const wantedNetworks = new Set();
  const priority = new Map(); // network id → position in the rights map (lower = better)
  for (const ids of Object.values(competition?.networks || {})) ids.forEach((id, i) => { wantedNetworks.add(id); if (!priority.has(id)) priority.set(id, i); });
  for (const b of event.broadcasts || []) for (const id of broadcastToNetworks(b)) { wantedNetworks.add(id); if (!priority.has(id)) priority.set(id, 0); }

  const windowStart = event.start - PRE_ROLL_MS;
  const windowEnd = event.start + durationMs(event.sport);
  const best = new Map(); // streamId → feed with strongest kind

  const offer = (c, kind) => {
    const cur = best.get(c.streamId);
    if (!cur || KIND_RANK[kind] < KIND_RANK[cur.kind]) best.set(c.streamId, toFeed(c, kind));
  };

  for (const { c, parsed } of prepared.eventChannels) if (matchesFixture(parsed, event)) offer(c, "event");
  if (epg) {
    for (const c of prepared.epgChannels) {
      const progs = epg.overlapping(c.epgId, windowStart, windowEnd);
      if (!progs.length) continue;
      if (progs.some((p) => titleMentionsTeam(p.title, event))) offer(c, "epg");
      else if (competition && progs.some((p) => competition.keywords.test(p.title))) offer(c, "network");
    }
  }
  for (const id of wantedNetworks) for (const c of prepared.byNetwork.get(id) || []) offer(c, "network");
  return { ...event, feeds: rankFeeds([...best.values()], regionOrder, priority) };
}

// Order: preferred region → evidence (epg > network > event) → rights-map
// position → quality. One entry per (label, region, quality); max 12.
export function rankFeeds(feeds, regionOrder, priority = new Map()) {
  const regionRank = (r) => { const i = regionOrder.indexOf(r); return i === -1 ? regionOrder.length : i; };
  const prio = (f) => (f.network && priority.has(f.network) ? priority.get(f.network) : 99);
  const seen = new Set();
  return [...feeds]
    .sort((a, b) => regionRank(a.region) - regionRank(b.region) || KIND_RANK[a.kind] - KIND_RANK[b.kind] || prio(a) - prio(b) || QUALITY_RANK[a.quality] - QUALITY_RANK[b.quality])
    .filter((f) => { const k = `${f.label}|${f.region}|${f.quality}`; return seen.has(k) ? false : seen.add(k); })
    .slice(0, MAX_FEEDS);
}
