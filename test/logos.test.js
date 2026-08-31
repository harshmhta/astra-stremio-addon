import test from "node:test";
import assert from "node:assert/strict";
import { normalizeChannelName, countryHintOf, createLogoResolver } from "../src/logos.js";

test("normalizeChannelName strips prefixes, tags, and quality tokens", () => {
  assert.equal(normalizeChannelName("IN: STAR SPORTS SELECT 1 (4K)."), "star sports select 1");
  assert.equal(normalizeChannelName("BG: Bnt 1"), "bnt 1");
  assert.equal(normalizeChannelName("(ID) (V+) ABC Australia"), "abc australia");
  assert.equal(normalizeChannelName("UK | SKY NEWS FHD"), "sky news");
  assert.equal(normalizeChannelName("CNN International HD"), "cnn international");
});

test("countryHintOf reads leading country markers", () => {
  assert.equal(countryHintOf("BG: Bnt 1"), "BG");
  assert.equal(countryHintOf("(ID) (V+) ABC Australia"), "ID");
  assert.equal(countryHintOf("UK | SKY NEWS"), "UK");
  assert.equal(countryHintOf("CNN International"), null);
});

const channelsPayload = [
  { id: "BNT1.bg", name: "BNT 1", alt_names: ["Bnt Edno"], country: "BG" },
  { id: "NovaTV.ba", name: "Nova TV", alt_names: [], country: "BA" },
  { id: "NovaTV.bg", name: "Nova TV", alt_names: [], country: "BG" },
  { id: "NoLogo.xx", name: "No Logo Channel", alt_names: [], country: "XX" },
];
const logosPayload = [
  { channel: "BNT1.bg", url: "https://logos/bnt1-small.png", in_use: true, width: 100 },
  { channel: "BNT1.bg", url: "https://logos/bnt1-big.png", in_use: true, width: 400 },
  { channel: "BNT1.bg", url: "https://logos/bnt1-unused.png", in_use: false, width: 900 },
  { channel: "NovaTV.ba", url: "https://logos/nova-ba.png", in_use: true, width: 200 },
  { channel: "NovaTV.bg", url: "https://logos/nova-bg.png", in_use: true, width: 200 },
];

function fakeFetch() {
  const fn = async (url) => {
    fn.calls.push(url);
    const body = url.includes("logos.json") ? logosPayload : channelsPayload;
    return new Response(JSON.stringify(body), { status: 200 });
  };
  fn.calls = [];
  return fn;
}

test("resolver matches by name, prefers country hint and biggest in-use logo", async () => {
  const r = createLogoResolver({ fetchImpl: fakeFetch() });
  await r.ready();
  assert.equal(r.resolve("BG: Bnt 1"), "https://logos/bnt1-big.png");
  assert.equal(r.resolve("BG: Nova TV"), "https://logos/nova-bg.png");
  assert.equal(r.resolve("BA: Nova TV HD"), "https://logos/nova-ba.png");
  assert.equal(r.resolve("Bnt Edno"), "https://logos/bnt1-big.png", "alt_names are indexed");
  assert.equal(r.resolve("No Logo Channel"), null, "channels without logos resolve to null");
  assert.equal(r.resolve("Utter Garbage 123"), null);
});

test("resolver loads once and survives fetch failure", async () => {
  const f = fakeFetch();
  const r = createLogoResolver({ fetchImpl: f });
  await r.ready();
  await r.ready();
  assert.equal(f.calls.length, 2, "channels+logos fetched exactly once");

  const failing = createLogoResolver({ fetchImpl: async () => { throw new Error("net down"); } });
  await failing.ready(); // must not throw
  assert.equal(failing.resolve("BG: Bnt 1"), null);
});
