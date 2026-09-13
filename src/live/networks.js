// Canonical broadcaster ids. Order matters: more specific aliases first.
// Each entry: { id, region, re } — `re` is tested against the lowercased
// channel name with punctuation collapsed to single spaces.
const N = (id, region, re) => ({ id, region, re });

// "sky sports" with the panel's occasional typo ("SKY SORTS"), plural only —
// singular "Sky Sport" is Germany/Italy/NZ, which we don't map.
const SKY = "sky s(?:p|op)?orts";

export const NETWORKS = [
  N("sky-sports-main-event", "UK", new RegExp(`${SKY} main event`)),
  N("sky-sports-premier-league", "UK", new RegExp(`${SKY} premier league`)),
  N("sky-sports-football", "UK", new RegExp(`${SKY} football`)),
  N("sky-sports-cricket", "UK", new RegExp(`${SKY} cricket`)),
  N("sky-sports-f1", "UK", new RegExp(`${SKY} f1`)),
  N("sky-sports-nfl", "UK", new RegExp(`${SKY} nfl`)),
  N("sky-sports-nba", "UK", new RegExp(`${SKY} nba`)),
  N("sky-sports-tennis", "UK", new RegExp(`${SKY} tennis`)),
  N("sky-sports-golf", "UK", new RegExp(`${SKY} golf`)),
  N("sky-sports-news", "UK", new RegExp(`${SKY} news`)),
  N("sky-sports-mix", "UK", new RegExp(`${SKY} mix`)),
  N("sky-sports-racing", "UK", new RegExp(`${SKY} racing`)),
  N("sky-sports-arena", "UK", new RegExp(`${SKY} arena`)),
  N("sky-sports-action", "UK", new RegExp(`${SKY} action`)),
  N("sky-sports-plus", "UK", new RegExp(`${SKY} plus`)),
  N("tnt-sports-1", "UK", /tnt sports? ?1\b/),
  N("tnt-sports-2", "UK", /tnt sports? ?2\b/),
  N("tnt-sports-3", "UK", /tnt sports? ?3\b/),
  N("tnt-sports-4", "UK", /tnt sports? ?4\b/),
  N("premier-sports-1", "UK", /premier sports? ?1\b/),
  N("premier-sports-2", "UK", /premier sports? ?2\b/),
  N("channel-5", "UK", /\bchannel 5\b/),
  N("channel-4", "UK", /\bchannel 4\b/),
  N("bbc-one", "UK", /\bbbc one\b|\bbbc 1\b/),
  N("bbc-two", "UK", /\bbbc two\b|\bbbc 2\b/),
  N("itv", "UK", /\bitv ?1?\b/),

  N("espn-plus", "US", /espn\s?\+|espn plus/),
  N("espn2", "US", /\bespn ?2\b/),
  N("espnu", "US", /\bespnu\b/),
  N("espn-deportes", "US", /espn deportes/),
  N("espn", "US", /\bespn ?1?\b/),
  N("sec-network", "US", /\bsec network\b/),
  N("big-ten-network", "US", /big ten network|\bbtn\b/),
  N("cbs-sports-network", "US", /cbs sports network|\bcbssn\b/),
  N("cbs", "US", /\bcbs\b/),
  N("nbcsn", "US", /\bnbcsn\b/),
  N("nbc", "US", /\bnbc\b/),
  N("usa-network", "US", /usa network|\busa net\b/),
  N("fs1", "US", /\bfs ?1\b|fox sports ?1\b/),
  N("fs2", "US", /\bfs ?2\b|fox sports ?2\b/),
  N("fox-soccer-plus", "US", /fox soccer plus/),
  N("fox-deportes", "US", /fox deportes/),
  N("fox", "US", /\bfox\b(?! sports)/),
  N("abc", "US", /\babc\b/),
  N("nfl-network", "US", /nfl network/),
  N("nba-tv", "US", /\bnba tv\b/),
  N("mlb-network", "US", /mlb network/),
  N("tennis-channel", "US", /tennis channel/),
  N("golf-channel", "US", /golf channel/),
  N("tbs", "US", /\btbs\b/),
  N("trutv", "US", /\btrutv\b/),
  N("tnt", "US", /\btnt\b(?! sports)/),
  N("willow", "US", /\bwillow\b/),
  N("paramount", "US", /paramount/),

  N("star-sports-select-1", "IN", /star sports select ?1\b/),
  N("star-sports-select-2", "IN", /star sports select ?2\b/),
  N("star-sports-1", "IN", /star sports ?1\b/),
  N("star-sports-2", "IN", /star sports ?2\b/),
  N("star-sports-3", "IN", /star sports ?3\b/),
  N("sony-sports-ten-1", "IN", /sony (?:sports )?ten ?1\b|\bten 1\b/),
  N("sony-sports-ten-2", "IN", /sony (?:sports )?ten ?2\b|\bten 2\b/),
  N("sony-sports-ten-3", "IN", /sony (?:sports )?ten ?3\b|\bten 3\b/),
  N("sony-sports-ten-4", "IN", /sony (?:sports )?ten ?4\b|\bten 4\b/),
  N("sony-sports-ten-5", "IN", /sony (?:sports )?ten ?5\b|\bten 5\b/),

  N("dazn", null, /\bdazn\b/),
  N("bein-sports", "AR", /bein sports?\b(?! ?\d)/),
];

// numbered beIN channels → bein-sports-N
const BEIN_N = /bein sports? ?(\d+)\b/;

function normalize(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[ᴴᴰᶠ⁴ᵏ]/g, " ")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();
}

export function networkOf(name) {
  const n = normalize(name);
  const bein = BEIN_N.exec(n);
  if (bein) return `bein-sports-${bein[1]}`;
  const hit = NETWORKS.find((x) => x.re.test(n));
  return hit ? hit.id : null;
}

export function networkRegion(id) {
  const hit = NETWORKS.find((x) => x.id === id);
  return hit ? hit.region : id?.startsWith("bein-sports") ? "AR" : null;
}
