import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeScoreboard, createEspn } from "../../src/live/fixtures/espn.js";
import { competitionById } from "../../src/live/taxonomy.js";

const fx = (n) => JSON.parse(readFileSync(new URL(`../fixtures/live/${n}.json`, import.meta.url)));

test("eng.1 scoreboard → events with logos, scores, status, US broadcasters", () => {
  const evs = normalizeScoreboard(fx("espn-eng1"), competitionById("premier-league"));
  assert.equal(evs.length, 3);
  const e = evs[0];
  assert.match(e.id, /^espn:\d+$/);
  assert.equal(e.sport, "soccer");
  assert.equal(e.competition, "premier-league");
  assert.equal(e.competitionName, "Premier League");
  assert.ok(e.home.name && e.away.name);
  assert.ok(e.home.logo.startsWith("https://a.espncdn.com/"));
  assert.equal(typeof e.start, "number");
  assert.equal(e.status, "upcoming");
  assert.equal(e.clock, "Scheduled");
  assert.ok(e.broadcasts.includes("USA Net"));
  assert.deepEqual(e.sources, ["espn"]);
  assert.deepEqual(e.feeds, []);
});

test("college football carries BTN and sets abbreviations", () => {
  const evs = normalizeScoreboard(fx("espn-cfb"), competitionById("college-football"));
  assert.ok(evs.some((e) => e.broadcasts.includes("BTN")), "BTN broadcast present");
  assert.ok(evs.every((e) => e.home.short && e.away.short));
});

test("nfl status strings pass through as clock; state pre → upcoming", () => {
  const evs = normalizeScoreboard(fx("espn-nfl"), competitionById("nfl"));
  assert.equal(evs[0].status, "upcoming");
  assert.match(evs[0].clock, /\d{1,2}\/\d{1,2} - \d/);
});

test("f1 weekend expands into one event per session", () => {
  const evs = normalizeScoreboard(fx("espn-f1"), competitionById("f1"));
  const names = evs.map((e) => e.home.name);
  assert.ok(names.includes("Practice 1") && names.includes("Qualifying") && names.includes("Race"), names.join(","));
  const race = evs.find((e) => e.home.name === "Race");
  assert.match(race.name, /Grand Prix · Race$/);
  assert.equal(race.away, null);
  assert.equal(race.sport, "f1");
  assert.ok(new Set(evs.map((e) => e.id)).size === evs.length, "unique ids per session");
});

test("state mapping: in → live, post → final", () => {
  const json = fx("espn-eng1");
  json.events[0].status.type.state = "in";
  json.events[0].status.type.shortDetail = "67'";
  json.events[1].status.type.state = "post";
  const evs = normalizeScoreboard(json, competitionById("premier-league"));
  assert.equal(evs[0].status, "live");
  assert.equal(evs[0].clock, "67'");
  assert.equal(evs[1].status, "final");
});

test("createEspn builds the right URL/headers, caches, and degrades to []", async () => {
  let t = Date.UTC(2026, 8, 13, 12);
  const calls = [];
  let fail = false;
  const fetchImpl = async (url, opts) => {
    calls.push({ url, headers: opts.headers });
    if (fail) throw new Error("boom");
    return new Response(JSON.stringify(fx("espn-eng1")), { status: 200 });
  };
  const espn = createEspn({ fetchImpl, now: () => t });
  const from = Date.UTC(2026, 8, 13);
  const to = Date.UTC(2026, 8, 20);
  const evs = await espn.events(competitionById("premier-league"), from, to);
  assert.equal(evs.length, 3);
  assert.equal(calls[0].url, "https://site.web.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=20260913-20260920&limit=400");
  assert.equal(calls[0].headers.Referer, "https://www.espn.com/");
  assert.match(calls[0].headers["User-Agent"], /Mozilla/);
  await espn.events(competitionById("premier-league"), from, to);
  assert.equal(calls.length, 1, "cached within 15 min when nothing is live");
  t += 16 * 60 * 1000;
  fail = true;
  const again = await espn.events(competitionById("premier-league"), from, to);
  assert.equal(calls.length, 2);
  assert.deepEqual(again, [], "failure degrades to empty, not an error");
  const cfbCalls = calls.length;
  fail = false;
  await espn.events(competitionById("college-football"), from, to);
  assert.match(calls[cfbCalls].url, /college-football\/scoreboard\?dates=20260913-20260920&limit=400&groups=80$/);
});
