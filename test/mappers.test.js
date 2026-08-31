import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  vodToPreview,
  seriesToPreview,
  vodInfoToMeta,
  seriesInfoToMeta,
  parseId,
} from "../src/mappers.js";

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));

test("vodToPreview maps a real panel item", () => {
  const p = vodToPreview(fx("vod-item"));
  assert.deepEqual(p, {
    id: "xc:v:385215:mp4",
    type: "movie",
    name: "Alien: Romulus (2024) (Tamil) (CAM)",
    poster: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/b33nnKl1GSFbao4l3fZDDqsMx0F.jpg",
    posterShape: "poster",
  });
});

test("vodToPreview defaults missing extension to mp4 and survives junk", () => {
  assert.equal(vodToPreview({ stream_id: 9, name: "x" }).id, "xc:v:9:mp4");
  assert.equal(vodToPreview({}).poster, null);
});

test("seriesToPreview maps a real panel item", () => {
  const p = seriesToPreview(fx("series-item"));
  assert.deepEqual(p, {
    id: "xc:s:11",
    type: "series",
    name: "Omar Series (URDU)",
    poster: "http://panel.example.com:8080/images/f4e551bd32a26912165a5f0d9465c9cd.jpg",
    posterShape: "poster",
  });
});

test("vodInfoToMeta builds a full movie meta", () => {
  const d = fx("vod-info");
  const m = vodInfoToMeta("xc:v:385215:mp4", d.info, d.movie_data);
  assert.equal(m.id, "xc:v:385215:mp4");
  assert.equal(m.type, "movie");
  assert.equal(m.name, "Alien: Romulus (2024) (Tamil) (CAM)");
  assert.equal(m.releaseInfo, "2024");
  assert.ok(m.description.startsWith("While scavenging"));
  assert.equal(m.runtime, "119 min");
  assert.ok(m.cast.includes("Cailee Spaeny"));
  assert.deepEqual(m.trailers, [{ source: "GTNMt84KT0k", type: "Trailer" }]);
});

test("vodInfoToMeta omits imdbRating when rating is falsy or zero", () => {
  const m = vodInfoToMeta("xc:v:1:mp4", { name: "x", rating: "0" }, {});
  assert.equal("imdbRating" in m, false);
  const m2 = vodInfoToMeta("xc:v:1:mp4", { name: "x", rating: "7.2" }, {});
  assert.equal(m2.imdbRating, "7.2");
});

test("seriesInfoToMeta builds meta with episode videos", () => {
  const d = fx("series-info");
  const m = seriesInfoToMeta(11, d.info, d.episodes);
  assert.equal(m.id, "xc:s:11");
  assert.equal(m.type, "series");
  assert.equal(m.name, "Omar Series (URDU)");
  const v = m.videos[0];
  assert.equal(v.id, "xc:e:130248:mp4");
  assert.equal(v.season, 1);
  assert.equal(v.episode, 1);
  assert.ok(v.title.length > 0);
});

test("seriesInfoToMeta survives empty episodes", () => {
  const m = seriesInfoToMeta(5, { name: "x" }, undefined);
  assert.deepEqual(m.videos, []);
});

test("parseId round-trips all id kinds and rejects garbage", () => {
  assert.deepEqual(parseId("xc:v:385215:mp4"), { kind: "movie", streamId: "385215", ext: "mp4" });
  assert.deepEqual(parseId("xc:s:11"), { kind: "series", seriesId: "11" });
  assert.deepEqual(parseId("xc:e:130248:mkv"), { kind: "episode", episodeId: "130248", ext: "mkv" });
  assert.equal(parseId("tt0111161"), null);
  assert.equal(parseId("xc:zz:1"), null);
  assert.equal(parseId("xc:v:"), null);
});

test("liveToPreview maps a real channel with square logo poster", async () => {
  const { liveToPreview } = await import("../src/mappers.js");
  const p = liveToPreview(fx("live-item"));
  assert.deepEqual(p, {
    id: "xc:l:98867",
    type: "tv",
    name: "IN: STAR SPORTS SELECT 1 (4K).",
    poster: "https://i.ibb.co/p4knk5y/images-4.png",
    posterShape: "square",
  });
});

test("liveToMeta includes logo and genres", async () => {
  const { liveToMeta } = await import("../src/mappers.js");
  const m = liveToMeta(fx("live-item"), [{ category_id: "356", category_name: "SPORTS | CRICKET" }]);
  assert.equal(m.id, "xc:l:98867");
  assert.equal(m.type, "tv");
  assert.equal(m.logo, "https://i.ibb.co/p4knk5y/images-4.png");
  assert.deepEqual(m.genres, ["SPORTS | CRICKET"]);
});

test("isRealChannel filters divider entries", async () => {
  const { isRealChannel } = await import("../src/mappers.js");
  assert.equal(isRealChannel({ name: "BG: ####### Bulgaria ######" }), false);
  assert.equal(isRealChannel({ name: "===== SPORTS =====" }), false);
  assert.equal(isRealChannel({ name: "CNN International" }), true);
  assert.equal(isRealChannel({}), false);
});

test("parseId handles live ids", () => {
  assert.deepEqual(parseId("xc:l:98867"), { kind: "live", streamId: "98867" });
});

test("parseId rejects non-numeric ids and weird extensions (URL-injection hygiene)", () => {
  assert.equal(parseId("xc:v:../../etc:mp4"), null);
  assert.equal(parseId("xc:v:123:m p4"), null);
  assert.equal(parseId("xc:v:123:toolongext"), null);
  assert.equal(parseId("xc:l:12abc"), null);
  assert.equal(parseId("xc:s:1;drop"), null);
});
