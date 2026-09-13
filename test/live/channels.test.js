import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { regionOf, qualityOf, networkOf, isEventChannel, buildChannelIndex } from "../../src/live/channels.js";

const labelled = JSON.parse(readFileSync(new URL("../fixtures/live/channel-names.json", import.meta.url)));

function score(fn, key) {
  const misses = labelled.filter((r) => fn(r) !== r[key]);
  return { ratio: 1 - misses.length / labelled.length, misses: misses.map((r) => `${r.name} → ${fn(r)} (want ${r[key]})`) };
}

test("region classifier agrees with the hand-labelled sample (≥95%)", () => {
  const s = score((r) => regionOf(r.name, r.category), "region");
  assert.ok(s.ratio >= 0.95, s.misses.join("\n"));
});
test("quality classifier agrees with the hand-labelled sample (≥95%)", () => {
  const s = score((r) => qualityOf(r.name, r.category), "quality");
  assert.ok(s.ratio >= 0.95, s.misses.join("\n"));
});
test("network classifier agrees with the hand-labelled sample (≥95%)", () => {
  const s = score((r) => networkOf(r.name), "network");
  assert.ok(s.ratio >= 0.95, s.misses.join("\n"));
});
test("event-channel classifier agrees with the hand-labelled sample (≥95%)", () => {
  const s = score((r) => isEventChannel(r.name, r.category), "isEvent");
  assert.ok(s.ratio >= 0.95, s.misses.join("\n"));
});

test("spot checks", () => {
  assert.equal(regionOf("UK || SKY SPORTS MAIN EVENT", "SPORTS | UK SPORTS"), "UK");
  assert.equal(regionOf("CRIC || STAR SPORTS 2 TELUGU ⁴ᵏ", "SPORTS | CRICKET"), "IN");
  assert.equal(regionOf("CRIC || TNT SPORTS 1 ᶠᴴᴰ", "SPORTS | CRICKET"), "UK", "network implies region");
  assert.equal(qualityOf("CRIC || STAR SPORTS 2 TELUGU ⁴ᵏ"), "4k");
  assert.equal(qualityOf("Sky Sport Premier League -HD (Local) ''hevc h.265''"), "hd");
  assert.equal(networkOf("UK: Sky Sports F1 (4K)"), "sky-sports-f1");
  assert.equal(networkOf("UK: SKY SORTS F1 (4K)"), "sky-sports-f1", "tolerates the panel's typo");
  assert.equal(networkOf("US (ESPN+ 003) | 2026 WSL Championship Tour"), "espn-plus");
  assert.equal(networkOf("Sky Sport News-HD (Local)"), null, "singular 'Sky Sport' is not UK Sky Sports");
  assert.equal(networkOf("UK: CBS Reality"), null, "US network alias under a UK prefix is rejected");
  assert.equal(networkOf("US: CBS Sports Network"), "cbs-sports-network");
  assert.equal(networkOf("Carib ESPN1 (P)"), "espn", "unranked prefixes keep the network (region handles trust)");
  assert.equal(isEventChannel("CA-DAZN 12: UEFA Champions League| Frankfurt vs. Liverpool| Wed 22 Oct 3:00 PM", "CANADA | LIVE EVENT ONLY"), true);
  assert.equal(isEventChannel("UK || SKY SPORTS MAIN EVENT", "SPORTS | UK SPORTS"), false);
});

test("buildChannelIndex drops dividers and attaches urls + categories", () => {
  const idx = buildChannelIndex(
    [
      { stream_id: 1, name: "BG: #### Bulgaria ####", category_id: "1" },
      { stream_id: 2, name: "UK || SKY SPORTS CRICKET", category_id: "9", epg_channel_id: "skycricket.uk", stream_icon: "x.png" },
    ],
    [{ category_id: "9", category_name: "SPORTS | UK SPORTS" }],
    (id) => `http://p/live/${id}.ts`,
  );
  assert.equal(idx.length, 1);
  assert.deepEqual(idx[0], {
    streamId: "2", name: "UK || SKY SPORTS CRICKET", region: "UK", quality: "sd", network: "sky-sports-cricket",
    categoryId: "9", category: "SPORTS | UK SPORTS", logo: "x.png", isEvent: false, epgId: "skycricket.uk", url: "http://p/live/2.ts",
  });
});
