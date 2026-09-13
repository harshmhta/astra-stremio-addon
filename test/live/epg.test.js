import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseXmltv, parseXmltvTime, createEpg } from "../../src/live/epg.js";

const sample = readFileSync(new URL("../fixtures/live/epg-sample.xml", import.meta.url), "utf8");

test("parseXmltvTime handles +0100 offsets", () => {
  assert.equal(parseXmltvTime("20260913082500 +0100"), Date.UTC(2026, 8, 13, 7, 25));
  assert.equal(parseXmltvTime("20260913082500 -0400"), Date.UTC(2026, 8, 13, 12, 25));
  assert.equal(parseXmltvTime("20260913082500"), Date.UTC(2026, 8, 13, 8, 25));
});

test("parseXmltv reads the real sample (trailing-space tags, entities)", () => {
  const map = parseXmltv(sample);
  assert.ok(map.size > 5, `channels: ${map.size}`);
  const all = [...map.values()].flat();
  assert.ok(all.length > 50, `programmes: ${all.length}`);
  for (const p of all.slice(0, 20)) {
    assert.ok(p.stop > p.start);
    assert.ok(typeof p.title === "string" && p.title.length > 0);
    assert.ok(!p.title.includes("&apos;"), "entities decoded");
  }
  const sorted = [...map.values()].every((list) => list.every((p, i) => i === 0 || list[i - 1].start <= p.start));
  assert.ok(sorted, "programmes sorted per channel");
});

test("parseXmltv tolerates junk and a fake channel with a quoted title", () => {
  const xml = `<tv><programme start="20260913100000 +0000" stop="20260913110000 +0000" channel="x.uk" ><title lang="en">Live: Coventry v Brighton &amp; Hove</title><desc>d</desc></programme><programme broken></tv>`;
  const map = parseXmltv(xml);
  assert.deepEqual(map.get("x.uk"), [{ start: Date.UTC(2026, 8, 13, 10), stop: Date.UTC(2026, 8, 13, 11), title: "Live: Coventry v Brighton & Hove", desc: "d" }]);
});

test("createEpg: overlapping/nowNext, TTL and stale-on-error", async () => {
  let t = Date.UTC(2026, 8, 13, 10, 30);
  let calls = 0;
  let fail = false;
  const xml = `<tv><programme start="20260913100000 +0000" stop="20260913110000 +0000" channel="x.uk"><title>A</title></programme><programme start="20260913110000 +0000" stop="20260913120000 +0000" channel="x.uk"><title>B</title></programme></tv>`;
  const fetchImpl = async () => { calls++; if (fail) throw new Error("down"); return new Response(xml, { status: 200 }); };
  const epg = createEpg({ url: "http://p/xmltv.php", fetchImpl, now: () => t });
  await epg.ready();
  assert.equal(calls, 1);
  assert.deepEqual(epg.overlapping("x.uk", Date.UTC(2026, 8, 13, 10, 45), Date.UTC(2026, 8, 13, 11, 15)).map((p) => p.title), ["A", "B"]);
  assert.deepEqual(epg.nowNext("x.uk", t).now.title, "A");
  assert.deepEqual(epg.nowNext("x.uk", t).next.title, "B");
  assert.deepEqual(epg.overlapping("nope", 0, 1), []);
  await epg.ready();
  assert.equal(calls, 1, "within TTL no refetch");
  t += 7 * 3600e3; fail = true;
  await epg.ready();
  assert.equal(calls, 2, "refresh attempted after TTL");
  assert.equal(epg.programmes("x.uk").length, 2, "stale data kept after failure");
});
