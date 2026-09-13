// Dev-only: captures real samples from the panel + fixture sources into
// test/fixtures/live/. Run: node --env-file=.env scripts/capture-live-fixtures.mjs
// Panel hosts are scrubbed so fixtures are safe to commit.
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = new URL("../test/fixtures/live/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const base = process.env.XC_BASE_URL.replace(/\/+$/, "");
const creds = `username=${process.env.XC_USERNAME}&password=${process.env.XC_PASSWORD}`;
const ESPN_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh) Chrome/128.0",
  Accept: "application/json",
  Referer: "https://www.espn.com/",
};
const scrub = (s) => s.replaceAll(base, "http://panel.example.com:8080").replaceAll(process.env.XC_USERNAME, "USER").replaceAll(process.env.XC_PASSWORD, "PASS");
const save = (name, data) => {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 1);
  writeFileSync(new URL(name, OUT), scrub(text));
  console.log(`wrote ${name} (${text.length} chars)`);
};
const getJson = async (url, headers = {}) => {
  const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
};

// --- panel: sample 60 channel names across every prefix family ---
const live = await getJson(`${base}/player_api.php?${creds}&action=get_live_streams`);
const cats = await getJson(`${base}/player_api.php?${creds}&action=get_live_categories`);
const catName = Object.fromEntries(cats.map((c) => [String(c.category_id), c.category_name]));
const buckets = [
  /^UK \|\|/, /^UK \|/, /^UK:/, /^USA?:/, /^US \(/, /^IN:/, /^CRIC/, /^CA-DAZN/, /^CA /, /^DSTV/, /^PT:/, /^NO:/, /^EX-YU/,
  /^Carib/, /^AU:/, /^Sky Sport/, /^EPL-/, /#{3,}|={3,}/, /League Pass/i, /MLB/i, /ESPN\+/, /bein/i, /star sports/i, /willow/i,
  /tnt sports/i, /premier sports/i, /sony/i, /fox sports/i, /\bBTN\b|big ten/i, /nfl network/i,
];
const seen = new Set();
const sample = [];
for (const re of buckets) {
  const hits = live.filter((c) => re.test(c.name) && !seen.has(c.stream_id)).slice(0, 2);
  for (const c of hits) {
    seen.add(c.stream_id);
    sample.push({ name: c.name, category: catName[String(c.category_id)] || null, region: null, quality: null, network: null, isEvent: null });
  }
}
save("channel-names.json", sample.slice(0, 60));

// --- panel: EPG cut down to sports networks, next 24h ---
const epgIds = new Set(live.filter((c) => c.epg_channel_id && /sky|tnt|willow|star|espn/i.test(c.name)).map((c) => c.epg_channel_id));
const xml = await (await fetch(`${base}/xmltv.php?${creds}`, { signal: AbortSignal.timeout(120_000) })).text();
const now = Date.now();
const toMs = (ts) => Date.UTC(+ts.slice(0, 4), +ts.slice(4, 6) - 1, +ts.slice(6, 8), +ts.slice(8, 10), +ts.slice(10, 12), +ts.slice(12, 14)) - (ts.length > 15 ? (ts[15] === "-" ? -1 : 1) * (+ts.slice(16, 18) * 60 + +ts.slice(18, 20)) * 60000 : 0);
const progs = [...xml.matchAll(/<programme start="([^"]+)" stop="([^"]+)" channel="([^"]+)"\s*>(.*?)<\/programme>/gs)]
  .filter((m) => epgIds.has(m[3]) && toMs(m[2]) > now && toMs(m[1]) < now + 24 * 3600e3)
  .map((m) => m[0].replace(/<icon[^>]*\/>/g, ""));
const chans = [...xml.matchAll(/<channel id="([^"]+)">(.*?)<\/channel>/gs)].filter((m) => epgIds.has(m[1])).map((m) => m[0].replace(/<icon[^>]*\/>/g, ""));
save("epg-sample.xml", `<?xml version="1.0" encoding="utf-8" ?><tv>${chans.join("")}${progs.join("")}</tv>`);

// --- ESPN scoreboard (7-day range), first 3 events each ---
const d0 = new Date();
const ymd = (d) => d.toISOString().slice(0, 10).replaceAll("-", "");
const range = `${ymd(d0)}-${ymd(new Date(d0.getTime() + 7 * 864e5))}`;
for (const [file, path, extra] of [
  ["espn-eng1.json", "soccer/eng.1", ""],
  ["espn-cfb.json", "football/college-football", "&groups=5"],
  ["espn-nfl.json", "football/nfl", ""],
  ["espn-f1.json", "racing/f1", ""],
]) {
  const url = `https://site.web.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${range}&limit=400${extra}`;
  const data = await getJson(url, ESPN_HEADERS);
  save(file, { ...data, events: (data.events || []).slice(0, 3) });
}
save("espn-header-ipl.json", await getJson("https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket&league=8048", ESPN_HEADERS));

// --- TheSportsDB ---
save("tsdb-next-india.json", await getJson("https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=137143"));
save("tsdb-team-alnassr.json", await getJson("https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=Al_Nassr"));
