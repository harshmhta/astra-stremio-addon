import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../src/server.js";

const fakeXtream = {
  getVodStreams: async () => [], getSeries: async () => [], getVodCategories: async () => [], getSeriesCategories: async () => [],
  getLiveStreams: async () => [], getLiveCategories: async () => [],
  getVodInfo: async () => ({}), getSeriesInfo: async () => ({}),
  movieUrl: () => "", episodeUrl: () => "", liveUrl: () => "",
};
const homePayload = { myTeams: { live: [], upcoming: [{ id: "espn:1", name: "x", feeds: [] }], recent: [] }, sports: [], channels: [], generatedAt: "2026-09-13T15:00:00.000Z" };
const fakeEngine = {
  home: async (teams) => ({ ...homePayload, teamsUsed: teams }),
  events: async ({ sport }) => (!sport || sport === "soccer" ? [{ id: "espn:1", sport: "soccer", name: "Liverpool vs Everton" }] : []),
  event: async (id) => (id === "espn:1" ? { id, name: "Liverpool vs Everton" } : null),
  channels: async ({ sport }) => [{ sport: sport || "soccer", feeds: [{ streamId: "1", channelName: "UK || SKY SPORTS MAIN EVENT" }] }],
  teams: () => [{ id: "liverpool", name: "Liverpool", sport: "soccer", badge: "b.png" }],
};

const SECRET = "s3";
async function start(liveApi = true) {
  const app = createApp({ xtream: fakeXtream, cinemeta: async () => { throw new Error("x"); }, logos: { ready: async () => {}, resolve: () => null }, live: fakeEngine, config: { secret: SECRET, addonName: "T", liveTv: false, liveApi } });
  const srv = app.listen(0);
  await new Promise((r) => srv.once("listening", r));
  const base = `http://127.0.0.1:${srv.address().port}/${SECRET}/api/v1`;
  const j = async (p) => { const res = await fetch(base + p); return { status: res.status, cors: res.headers.get("access-control-allow-origin"), body: await res.json().catch(() => null) }; };
  return { srv, j, root: `http://127.0.0.1:${srv.address().port}` };
}

test("home/events/event/channels/teams/search routes", async () => {
  const { srv, j } = await start();
  try {
    const home = await j("/home");
    assert.equal(home.status, 200);
    assert.equal(home.cors, "*");
    assert.equal(home.body.myTeams.upcoming[0].id, "espn:1");
    assert.equal(home.body.teamsUsed, undefined, "default teams → engine default (undefined passthrough)");
    const custom = await j("/home?teams=liverpool,nope,india-cricket");
    assert.deepEqual(custom.body.teamsUsed, ["liverpool", "india-cricket"], "unknown ids dropped");
    assert.equal((await j("/events?sport=soccer")).body.events.length, 1);
    assert.equal((await j("/events?sport=nba")).body.events.length, 0);
    assert.equal((await j("/events/espn:1")).body.event.name, "Liverpool vs Everton");
    assert.equal((await j("/events/nope")).status, 404);
    assert.equal((await j("/channels?sport=cricket")).body.rows[0].sport, "cricket");
    assert.equal((await j("/teams")).body.teams[0].id, "liverpool");
    const s = await j("/search?q=everton");
    assert.equal(s.body.events.length, 1);
    assert.equal((await j("/search?q=main%20event")).body.channels.length, 1);
    assert.equal((await j("/nope")).status, 404);
  } finally { srv.close(); }
});

test("LIVE_API off → 404, and the Stremio manifest is untouched by the live API", async () => {
  const off = await start(false);
  try { assert.equal((await off.j("/home")).status, 404); } finally { off.srv.close(); }
  const on = await start(true);
  try {
    const res = await fetch(`${on.root}/${SECRET}/manifest.json`);
    const m = await res.json();
    assert.deepEqual(m.catalogs.map((c) => c.id), ["xc-movies", "xc-series"]);
  } finally { on.srv.close(); }
});
