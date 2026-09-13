// Sports, competitions (with ESPN ids + rights-map networks per region),
// and the user's teams with aliases. Pure data + matchers.

export const SPORTS = ["soccer", "college-football", "nfl", "cricket", "nba", "mlb", "f1", "tennis"];

const espnLogo = (path) => `https://a.espncdn.com/i/leaguelogos/${path}`;

export const COMPETITIONS = [
  {
    id: "premier-league", sport: "soccer", name: "Premier League",
    espn: { sport: "soccer", league: "eng.1" }, keywords: /(?<!indian )premier league|\bepl\b/i, logo: espnLogo("soccer/500/23.png"),
    networks: { UK: ["sky-sports-premier-league", "sky-sports-main-event", "tnt-sports-1"], US: ["nbc", "usa-network", "nbcsn"], IN: ["star-sports-select-1", "star-sports-select-2"] },
  },
  {
    id: "la-liga", sport: "soccer", name: "La Liga",
    espn: { sport: "soccer", league: "esp.1" }, keywords: /la ?liga|laliga/i, logo: espnLogo("soccer/500/15.png"),
    networks: { UK: ["premier-sports-1", "premier-sports-2"], US: ["espn", "espn2", "abc", "espn-plus"], IN: [] },
  },
  {
    id: "champions-league", sport: "soccer", name: "Champions League",
    espn: { sport: "soccer", league: "uefa.champions" }, keywords: /champions league|\bucl\b/i, logo: espnLogo("soccer/500/2.png"),
    networks: { UK: ["tnt-sports-1", "tnt-sports-2", "tnt-sports-3", "tnt-sports-4"], US: ["cbs-sports-network", "cbs", "paramount"], IN: ["sony-sports-ten-1", "sony-sports-ten-2", "sony-sports-ten-3", "sony-sports-ten-5"] },
  },
  {
    id: "saudi-pro-league", sport: "soccer", name: "Saudi Pro League",
    espn: { sport: "soccer", league: "ksa.1" }, keywords: /saudi pro league|roshn|\bspl\b/i, logo: espnLogo("soccer/500/2489.png"),
    networks: { UK: [], US: ["fs2", "fox-soccer-plus", "fox-deportes"], IN: [] },
  },
  {
    id: "mls", sport: "soccer", name: "MLS",
    espn: { sport: "soccer", league: "usa.1" }, keywords: /\bmls\b|major league soccer/i, logo: espnLogo("soccer/500/19.png"),
    networks: { UK: [], US: ["fox", "fs1"], IN: [] },
  },
  {
    id: "fa-cup", sport: "soccer", name: "FA Cup",
    espn: { sport: "soccer", league: "eng.fa" }, keywords: /\bfa cup\b/i, logo: espnLogo("soccer/500/40.png"),
    networks: { UK: ["tnt-sports-1", "tnt-sports-2", "tnt-sports-3", "tnt-sports-4", "bbc-one"], US: ["espn", "espn-plus"], IN: ["sony-sports-ten-2"] },
  },
  {
    id: "carabao-cup", sport: "soccer", name: "Carabao Cup",
    espn: { sport: "soccer", league: "eng.league_cup" }, keywords: /carabao|efl cup|league cup/i, logo: espnLogo("soccer/500/41.png"),
    networks: { UK: ["sky-sports-football", "sky-sports-main-event", "itv"], US: ["cbs-sports-network", "paramount"], IN: [] },
  },
  {
    id: "copa-del-rey", sport: "soccer", name: "Copa del Rey",
    espn: { sport: "soccer", league: "esp.copa_del_rey" }, keywords: /copa del rey/i, logo: espnLogo("soccer/500/80.png"),
    networks: { UK: ["premier-sports-1", "premier-sports-2"], US: ["espn-plus"], IN: [] },
  },
  {
    id: "college-football", sport: "college-football", name: "College Football",
    espn: { sport: "football", league: "college-football", groups: "80" }, keywords: /college football|\bncaaf?\b|big ten|\bcfb\b/i, logo: espnLogo("ncaa/500/1.png"),
    networks: { UK: [], US: ["fox", "fs1", "big-ten-network", "cbs", "cbs-sports-network", "nbc", "abc", "espn", "espn2", "espnu", "sec-network"], IN: [] },
  },
  {
    id: "nfl", sport: "nfl", name: "NFL",
    espn: { sport: "football", league: "nfl" }, keywords: /\bnfl\b/i, logo: espnLogo("nfl/500/nfl.png"),
    networks: { UK: ["sky-sports-nfl", "channel-5", "sky-sports-main-event"], US: ["cbs", "fox", "nbc", "espn", "abc", "nfl-network"], IN: ["star-sports-1"] },
  },
  {
    id: "nba", sport: "nba", name: "NBA",
    espn: { sport: "basketball", league: "nba" }, keywords: /\bnba\b/i, logo: espnLogo("nba/500/nba.png"),
    networks: { UK: ["sky-sports-nba", "sky-sports-main-event"], US: ["abc", "espn", "nbc", "nbcsn", "nba-tv"], IN: [] },
  },
  {
    id: "mlb", sport: "mlb", name: "MLB",
    espn: { sport: "baseball", league: "mlb" }, keywords: /\bmlb\b|major league baseball/i, logo: espnLogo("mlb/500/mlb.png"),
    networks: { UK: ["sky-sports-main-event", "sky-sports-mix"], US: ["fox", "fs1", "tbs", "nbc", "nbcsn", "espn", "mlb-network"], IN: ["star-sports-1"] },
  },
  {
    id: "ipl", sport: "cricket", name: "IPL",
    espn: null, espnHeader: { sport: "cricket", league: "8048" }, keywords: /indian premier league|\bipl\b/i, logo: null,
    networks: { UK: ["sky-sports-cricket"], US: ["willow"], IN: ["star-sports-1"] },
  },
  {
    id: "cricket-international", sport: "cricket", name: "International Cricket",
    espn: null, keywords: /test cricket|\bodi\b|t20i?\b|cricket|\bicc\b/i, logo: null,
    networks: { UK: ["tnt-sports-1", "tnt-sports-2", "tnt-sports-3", "sky-sports-cricket"], US: ["willow"], IN: ["star-sports-1"] },
  },
  {
    id: "f1", sport: "f1", name: "Formula 1",
    espn: { sport: "racing", league: "f1" }, keywords: /formula ?1|\bf1\b|grand prix/i, logo: espnLogo("f1/500/f1.png"),
    networks: { UK: ["sky-sports-f1", "channel-4"], US: [], IN: [] },
  },
  {
    id: "tennis", sport: "tennis", name: "Tennis",
    espn: { sport: "tennis", league: "atp" }, keywords: /\batp\b|\bwta\b|wimbledon|roland garros|us open tennis|australian open|tennis/i, logo: null,
    networks: { UK: ["sky-sports-tennis", "tnt-sports-1", "tnt-sports-2", "bbc-one", "bbc-two"], US: ["tennis-channel", "espn", "espn2", "tnt", "trutv"], IN: ["sony-sports-ten-5", "star-sports-1"] },
  },
];

const teamLogo = (path) => `https://a.espncdn.com/i/teamlogos/${path}`;

export const TEAMS = [
  { id: "penn-state", name: "Penn State", sport: "college-football", competitions: ["college-football"], aliases: [/\bpenn state\b/i, /nittany lions/i, /\bpsu\b/i], tsdbId: null, espnNames: ["Penn State Nittany Lions"], badge: teamLogo("ncaa/500/213.png") },
  { id: "real-madrid", name: "Real Madrid", sport: "soccer", competitions: ["la-liga", "champions-league", "copa-del-rey"], aliases: [/\breal madrid\b/i, /\br\.? ?madrid\b/i, /\brma\b/i], tsdbId: "133738", espnNames: ["Real Madrid"], badge: teamLogo("soccer/500/86.png") },
  { id: "liverpool", name: "Liverpool", sport: "soccer", competitions: ["premier-league", "champions-league", "fa-cup", "carabao-cup"], aliases: [/\bliverpool\b(?!\s*(?:women|ladies|fc women|u\d{2}|youth))/i, /\blfc\b/i], tsdbId: "133602", espnNames: ["Liverpool"], badge: teamLogo("soccer/500/364.png") },
  { id: "al-nassr", name: "Al Nassr", sport: "soccer", competitions: ["saudi-pro-league"], aliases: [/\bal[\s-]?nassr\b/i], tsdbId: "136022", espnNames: ["Al Nassr"], badge: "https://r2.thesportsdb.com/images/media/team/badge/84yvqi1748524565.png" },
  { id: "mumbai-indians", name: "Mumbai Indians", sport: "cricket", competitions: ["ipl"], aliases: [/mumbai indians/i, /\bmi\b/i], contextOnly: true, tsdbId: "135795", espnNames: ["Mumbai Indians"], badge: "https://r2.thesportsdb.com/images/media/team/badge/l40j8p1487678631.png" },
  { id: "india-cricket", name: "India", sport: "cricket", competitions: ["cricket-international"], aliases: [/\bindia\b/i], contextOnly: true, tsdbId: "137143", espnNames: ["India"], badge: "https://r2.thesportsdb.com/images/media/team/badge/donl7g1646775159.png" },
];

const CRICKET_CONTEXT = /cricket|\bipl\b|t20|\bodi\b|test match|\bicc\b/i;

export const competitionById = (id) => COMPETITIONS.find((c) => c.id === id) || null;
export const teamById = (id) => TEAMS.find((t) => t.id === id) || null;

export function matchCompetition(text) {
  const s = String(text || "");
  const hit = COMPETITIONS.find((c) => c.keywords.test(s));
  return hit ? hit.id : null;
}

// sport: optional hint ("cricket") that unlocks context-only aliases such as "MI" and "India".
export function matchTeams(text, sport = null) {
  const s = String(text || "");
  const cricketContext = sport === "cricket" || CRICKET_CONTEXT.test(s);
  return TEAMS.filter((t) => {
    if (t.contextOnly && !(cricketContext && (sport == null || sport === t.sport))) return false;
    return t.aliases.some((re) => re.test(s));
  }).map((t) => t.id);
}

export function teamsFromEnv(str) {
  const ids = String(str || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return TEAMS.map((t) => t.id);
  return ids.filter((id) => teamById(id));
}
