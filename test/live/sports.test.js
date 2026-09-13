import test from "node:test";
import assert from "node:assert/strict";
import { createSportsEngine } from "../../src/live/sports.js";

const NOW = Date.UTC(2026, 8, 13, 15, 0);
const H = 3600e3;

const ev = (over) => ({
  id: "espn:1", sport: "soccer", competition: "premier-league", competitionName: "Premier League", logo: null, name: "x", start: NOW - 0.5 * H,
  status: "live", clock: "31'", home: { name: "Liverpool", short: "LIV", logo: "https://l/liv.png", score: "1" }, away: { name: "Everton", short: "EVE", logo: "https://l/eve.png", score: "0" },
  broadcasts: ["USA Net"], sources: ["espn"], feeds: [], ...over,
});

const channels = [
  { stream_id: 1, name: "UK || SKY SPORTS MAIN EVENT", category_id: "9", epg_channel_id: "sme.uk", stream_icon: "sme.png" },
  { stream_id: 2, name: "US: USA Network HD", category_id: "9" },
  { stream_id: 3, name: "UK || SKY SPORTS CRICKET", category_id: "9", epg_channel_id: "ssc.uk" },
  { stream_id: 4, name: "IN: STAR SPORTS 1 (4K).", category_id: "9" },
];
const fakeXtream = {
  getLiveStreams: async () => channels,
  getLiveCategories: async () => [{ category_id: "9", category_name: "SPORTS | SPORTS" }],
  liveUrl: (id) => `http://p/live/${id}.ts`,
};
const fakeEpg = {
  ready: async () => {},
  overlapping: (id, a, b) => (id === "sme.uk" ? [{ start: NOW - H, stop: NOW + H, title: "Live Premier League: Liverpool v Everton", desc: "" }] : []),
};
const fakeEspn = { events: async (comp) => (comp.id === "premier-league" ? [ev()] : []) };
const fakeHeader = { events: async () => [] };
const fakeSportsDb = {
  nextEvent: async (teamId) => (teamId === "137143" ? [ev({ id: "tsdb:9", sport: "cricket", competition: "cricket-international", competitionName: "ODI Series", start: NOW + 20 * H, status: "upcoming", clock: null, home: { name: "India Cricket", short: "", logo: null, score: null }, away: { name: "West Indies Cricket", short: "", logo: null, score: null }, broadcasts: [], sources: ["tsdb"] })] : teamId === "133602" ? [ev({ id: "tsdb:5", sources: ["tsdb"], home: { name: "Liverpool FC", short: "", logo: null, score: null }, away: { name: "Everton FC", short: "", logo: null, score: null }, start: NOW - 0.5 * H + 5 * 60e3 })] : []),
  lastEvent: async () => [],
  badge: async () => null,
};

const engine = () => createSportsEngine({ xtream: fakeXtream, epg: fakeEpg, espn: fakeEspn, espnHeader: fakeHeader, sportsDb: fakeSportsDb, config: { teams: ["liverpool", "india-cricket"], regionOrder: ["UK", "US", "IN", "CA", "other"] }, now: () => NOW, log: () => {} });

test("home: merges duplicate fixtures across sources, keeps ESPN data, flags my teams", async () => {
  const home = await engine().home();
  assert.equal(home.myTeams.live.length, 1, JSON.stringify(home.myTeams));
  const liv = home.myTeams.live[0];
  assert.equal(liv.home.logo, "https://l/liv.png", "ESPN logos win");
  assert.deepEqual(liv.sources.sort(), ["espn", "tsdb"]);
  assert.equal(liv.isMyTeam, true);
  assert.equal(liv.feeds[0].kind, "epg");
  assert.equal(liv.feeds[0].label, "Sky Sports Main Event");
  assert.equal(liv.feeds[1].label, "USA Network");
});

test("home: upcoming my-team event without any feed still appears", async () => {
  const home = await engine().home();
  assert.equal(home.myTeams.upcoming.length, 1);
  const ind = home.myTeams.upcoming[0];
  assert.equal(ind.sport, "cricket");
  assert.ok(ind.feeds.length >= 1, "rights-map network feed (Sky Sports Cricket / Star Sports) attached");
  assert.equal(ind.feeds[0].label, "Sky Sports Cricket");
});

test("home: sports rows omit empty sports and are in SPORTS order; channels rows list sports networks", async () => {
  const home = await engine().home();
  assert.deepEqual(home.sports.map((s) => s.sport), ["soccer"]);
  assert.equal(home.sports[0].live.length, 1);
  const cricketRow = home.channels.find((c) => c.sport === "cricket");
  assert.ok(cricketRow && cricketRow.feeds.some((f) => f.label === "Sky Sports Cricket"));
  assert.ok(typeof home.generatedAt === "string");
});

test("status refinement: tsdb 'upcoming' becomes live inside the window; live past duration becomes final", async () => {
  const e = createSportsEngine({
    xtream: fakeXtream, epg: fakeEpg, espnHeader: fakeHeader, sportsDb: { nextEvent: async () => [], lastEvent: async () => [], badge: async () => null },
    espn: { events: async (comp) => (comp.id === "premier-league" ? [ev({ id: "espn:a", status: "upcoming", start: NOW - 10 * 60e3 }), ev({ id: "espn:b", status: "live", start: NOW - 4 * H, home: { name: "Chelsea", short: "", logo: null, score: "2" }, away: { name: "Fulham", short: "", logo: null, score: "2" } })] : []) },
    config: { teams: [], regionOrder: ["UK"] }, now: () => NOW, log: () => {},
  });
  const evs = await e.events({ sport: "soccer" });
  assert.equal(evs.find((x) => x.id === "espn:a").status, "live");
  assert.equal(evs.find((x) => x.id === "espn:b").status, "final");
});

test("event(id) and teams()", async () => {
  const e = engine();
  const one = await e.event("espn:1");
  assert.equal(one.id, "espn:1");
  assert.equal(await e.event("nope"), null);
  const teams = e.teams();
  assert.ok(teams.find((t) => t.id === "penn-state").badge);
});
