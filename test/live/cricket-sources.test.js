import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeHeader, createEspnHeader } from "../../src/live/fixtures/espnHeader.js";
import { normalizeTsdbEvent, createSportsDb } from "../../src/live/fixtures/thesportsdb.js";
import { competitionById } from "../../src/live/taxonomy.js";

const fx = (n) => JSON.parse(readFileSync(new URL(`../fixtures/live/${n}.json`, import.meta.url)));

test("ESPN header (IPL) → cricket events with both teams, logos and a result summary", () => {
  const evs = normalizeHeader(fx("espn-header-ipl"), competitionById("ipl"));
  assert.ok(evs.length >= 1);
  const e = evs[0];
  assert.match(e.id, /^espn-header:\d+$/);
  assert.equal(e.sport, "cricket");
  assert.equal(e.competition, "ipl");
  assert.equal(e.home.name, "Royal Challengers Bengaluru");
  assert.equal(e.away.name, "Gujarat Titans");
  assert.ok(e.home.logo.startsWith("https://a.espncdn.com/"));
  assert.equal(e.status, "final");
  assert.ok(typeof e.clock === "string" && e.clock.length > 0);
  assert.deepEqual(e.sources, ["espn-header"]);
});

test("createEspnHeader fetches the header URL and degrades to []", async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return new Response(JSON.stringify(fx("espn-header-ipl")), { status: 200 }); };
  const h = createEspnHeader({ fetchImpl, now: () => Date.UTC(2026, 8, 13) });
  const evs = await h.events(competitionById("ipl"));
  assert.equal(evs.length >= 1, true);
  assert.equal(calls[0], "https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket&league=8048");
  const failing = createEspnHeader({ fetchImpl: async () => { throw new Error("x"); } });
  assert.deepEqual(await failing.events(competitionById("ipl")), []);
});

test("TheSportsDB next event → cricket event with UTC start", () => {
  const raw = fx("tsdb-next-india").events[0];
  const e = normalizeTsdbEvent(raw, Date.UTC(2026, 8, 13));
  assert.match(e.id, /^tsdb:\d+$/);
  assert.equal(e.sport, "cricket");
  assert.ok(/india/i.test(e.home.name) || /india/i.test(e.away.name));
  assert.ok(/west indies/i.test(e.home.name + e.away.name));
  assert.equal(new Date(e.start).toISOString().slice(0, 10), raw.dateEvent);
  assert.equal(e.status, "upcoming");
  assert.deepEqual(e.sources, ["tsdb"]);
});

test("createSportsDb: nextEvent/lastEvent/badge with caching and graceful failure", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("searchteams")) return new Response(JSON.stringify(fx("tsdb-team-alnassr")), { status: 200 });
    if (url.includes("eventslast")) return new Response(JSON.stringify({ results: fx("tsdb-next-india").events }), { status: 200 });
    return new Response(JSON.stringify(fx("tsdb-next-india")), { status: 200 });
  };
  const db = createSportsDb({ fetchImpl, now: () => Date.UTC(2026, 8, 13) });
  const next = await db.nextEvent("137143");
  assert.equal(next.length, 1);
  assert.match(calls[0], /eventsnext\.php\?id=137143$/);
  await db.nextEvent("137143");
  assert.equal(calls.length, 1, "cached");
  const last = await db.lastEvent("137143");
  assert.equal(last.length, 1);
  assert.match(await db.badge("Al Nassr"), /\.png$/);
  assert.match(calls.at(-1), /searchteams\.php\?t=Al_Nassr$/);
  const failing = createSportsDb({ fetchImpl: async () => { throw new Error("x"); } });
  assert.deepEqual(await failing.nextEvent("1"), []);
  assert.equal(await failing.badge("x"), null);
});
