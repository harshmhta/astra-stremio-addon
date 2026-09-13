import test from "node:test";
import assert from "node:assert/strict";
import { attachFeeds, rankFeeds, broadcastToNetworks, durationMs, feedLabel } from "../../src/live/ranking.js";

const NOW = Date.UTC(2026, 8, 13, 14, 30);
const KICKOFF = Date.UTC(2026, 8, 13, 14, 0);
const REGIONS = ["UK", "US", "IN", "CA", "other"];

const ch = (streamId, name, extra = {}) => ({
  streamId: String(streamId), name, region: "other", quality: "sd", network: null, categoryId: "1", category: "SPORTS", logo: null, isEvent: false, epgId: null, url: `http://p/live/${streamId}.ts`, ...extra,
});
const event = () => ({
  id: "espn:1", sport: "soccer", competition: "premier-league", competitionName: "Premier League", name: "Brighton at Coventry", start: KICKOFF,
  status: "live", clock: "31'", home: { name: "Coventry City" }, away: { name: "Brighton & Hove Albion" }, broadcasts: ["USA Net"], sources: ["espn"], feeds: [],
});

const fakeEpg = (byId) => ({ overlapping: (epgId, a, b) => (byId[epgId] || []).filter((p) => p.start < b && p.stop > a) });

test("broadcastToNetworks maps ESPN broadcaster names to canonical ids", () => {
  assert.deepEqual(broadcastToNetworks("BTN"), ["big-ten-network"]);
  assert.deepEqual(broadcastToNetworks("USA Net"), ["usa-network"]);
  assert.deepEqual(broadcastToNetworks("FOX"), ["fox"]);
  assert.deepEqual(broadcastToNetworks("Peacock"), []);
});

test("durationMs per sport", () => {
  assert.equal(durationMs("soccer"), 2 * 3600e3);
  assert.equal(durationMs("nfl"), 3.5 * 3600e3);
  assert.equal(durationMs("unknown"), 3 * 3600e3);
});

test("EPG evidence beats rights-map network feeds, even at lower quality", () => {
  const channels = [
    ch(1, "UK || SKY SPORTS MAIN EVENT", { region: "UK", quality: "4k", network: "sky-sports-main-event", epgId: "sme.uk" }),
    ch(2, "UK || SKY SPORTS PREMIER LEAGUE", { region: "UK", quality: "sd", network: "sky-sports-premier-league", epgId: "sspl.uk" }),
  ];
  const epg = fakeEpg({ "sspl.uk": [{ start: KICKOFF - 600e3, stop: KICKOFF + 7200e3, title: "Live Premier League: Coventry v Brighton", desc: "" }], "sme.uk": [{ start: KICKOFF, stop: KICKOFF + 7200e3, title: "Solheim Cup Golf", desc: "" }] });
  const e = attachFeeds(event(), { channels, epg, regionOrder: REGIONS, now: NOW });
  assert.equal(e.feeds[0].streamId, "2");
  assert.equal(e.feeds[0].kind, "epg");
  assert.equal(e.feeds[1].streamId, "1");
  assert.equal(e.feeds[1].kind, "network");
});

test("ESPN broadcast names attach US network channels; UK still ranks first", () => {
  const channels = [
    ch(10, "US: USA Network HD", { region: "US", quality: "hd", network: "usa-network" }),
    ch(11, "UK || TNT SPORTS 1", { region: "UK", quality: "sd", network: "tnt-sports-1" }),
    ch(12, "IN: STAR SPORTS SELECT 1 (4K)", { region: "IN", quality: "4k", network: "star-sports-select-1" }),
  ];
  const e = attachFeeds(event(), { channels, epg: fakeEpg({}), regionOrder: REGIONS, now: NOW });
  assert.deepEqual(e.feeds.map((f) => f.streamId), ["11", "10", "12"]);
  assert.ok(e.feeds.every((f) => f.kind === "network"));
});

test("event channels attach only when name + date match the fixture", () => {
  const channels = [
    ch(20, "CA-DAZN 3: Premier League| Coventry City vs. Brighton| Sun 13 Sep 3:00 PM", { region: "CA", isEvent: true, network: "dazn" }),
    ch(21, "CA-DAZN 4: Premier League| Coventry City vs. Brighton| Wed 22 Oct 3:00 PM", { region: "CA", isEvent: true, network: "dazn" }),
    ch(22, "CA-DAZN 5: Premier League| Arsenal vs. Brighton| Sun 13 Sep 3:00 PM", { region: "CA", isEvent: true, network: "dazn" }),
  ];
  const e = attachFeeds(event(), { channels, epg: fakeEpg({}), regionOrder: REGIONS, now: NOW });
  assert.deepEqual(e.feeds.map((f) => f.streamId), ["20"]);
  assert.equal(e.feeds[0].kind, "event");
});

test("competition-only EPG titles count as network-level evidence, not team-level", () => {
  const channels = [ch(30, "UK || SKY SPORTS FOOTBALL", { region: "UK", network: "sky-sports-football", epgId: "ssf.uk" })];
  const epg = fakeEpg({ "ssf.uk": [{ start: KICKOFF, stop: KICKOFF + 7200e3, title: "Live Premier League", desc: "" }] });
  const e = attachFeeds(event(), { channels, epg, regionOrder: REGIONS, now: NOW });
  assert.equal(e.feeds.length, 1);
  assert.equal(e.feeds[0].kind, "network");
});

test("rankFeeds orders by evidence, region, quality and caps at 12", () => {
  const mk = (i, kind, region, quality) => ({ streamId: String(i), url: "", label: "", channelName: "", region, quality, kind, logo: null });
  const feeds = [mk(1, "network", "US", "4k"), mk(2, "epg", "IN", "sd"), mk(3, "event", "UK", "4k"), mk(4, "network", "UK", "hd"), mk(5, "network", "UK", "4k")];
  assert.deepEqual(rankFeeds(feeds, REGIONS).map((f) => f.streamId), ["2", "5", "4", "1", "3"]);
  const many = Array.from({ length: 20 }, (_, i) => mk(i, "network", "UK", "sd"));
  assert.equal(rankFeeds(many, REGIONS).length, 12);
});

test("feedLabel humanizes network ids and falls back to a cleaned channel name", () => {
  assert.equal(feedLabel({ network: "sky-sports-main-event", name: "UK || SKY SPORTS MAIN EVENT" }), "Sky Sports Main Event");
  assert.equal(feedLabel({ network: "tnt-sports-1", name: "x" }), "TNT Sports 1");
  assert.equal(feedLabel({ network: "espn-plus", name: "x" }), "ESPN+");
  assert.equal(feedLabel({ network: null, name: "CA-DAZN 3: Premier League| Coventry City vs. Brighton| Sun 13 Sep 3:00 PM" }), "DAZN 3");
});
