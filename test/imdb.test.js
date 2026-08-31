import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTitle, titleYearOf, createImdbMatcher, parseCinemetaId } from "../src/imdb.js";

test("normalizeTitle strips bracketed tags, punctuation, and case", () => {
  assert.equal(normalizeTitle("Alien: Romulus (2024) (Tamil) (CAM)"), "alien romulus");
  assert.equal(normalizeTitle("Inception (2010)."), "inception");
  assert.equal(normalizeTitle("SPIDER-MAN: No Way Home [4K]"), "spider man no way home");
  assert.equal(normalizeTitle("  WALL·E  "), "wall e");
});

test("titleYearOf extracts a plausible year from an item name", () => {
  assert.equal(titleYearOf("Alien: Romulus (2024) (CAM)"), 2024);
  assert.equal(titleYearOf("Old Movie (1954)"), 1954);
  assert.equal(titleYearOf("No Year Here"), null);
  assert.equal(titleYearOf("Fake (0000)"), null);
});

test("parseCinemetaId handles movie and episode ids", () => {
  assert.deepEqual(parseCinemetaId("tt1375666"), { imdbId: "tt1375666", season: null, episode: null });
  assert.deepEqual(parseCinemetaId("tt0903747:5:14"), { imdbId: "tt0903747", season: 5, episode: 14 });
  assert.equal(parseCinemetaId("xc:v:1:mp4"), null);
  assert.equal(parseCinemetaId("tt12:1"), null);
});

const movies = [
  { stream_id: 1, name: "Inception (2010)", container_extension: "mkv" },
  { stream_id: 2, name: "Inception (2010) (Hindi)", container_extension: "mp4" },
  { stream_id: 3, name: "Inception Documentary (2019)", container_extension: "mp4" },
  { stream_id: 4, name: "Alien: Romulus (2024) (Tamil) (CAM)", container_extension: "mp4" },
];

test("matchMovies finds all copies by normalized title and filters by year", () => {
  const m = createImdbMatcher();
  const hits = m.matchMovies(movies, { name: "Inception", year: 2010 });
  assert.deepEqual(hits.map((h) => h.stream_id), [1, 2]);
});

test("matchMovies tolerates ±1 year and items without a year", () => {
  const m = createImdbMatcher();
  const withNoYear = [{ stream_id: 9, name: "Inception", container_extension: "mp4" }];
  assert.equal(m.matchMovies(withNoYear, { name: "Inception", year: 2010 }).length, 1);
  assert.equal(m.matchMovies(movies, { name: "Inception", year: 2011 }).length, 2);
  assert.equal(m.matchMovies(movies, { name: "Inception", year: 1999 }).length, 0);
});

test("matchMovies with punctuated cinemeta names", () => {
  const m = createImdbMatcher();
  const hits = m.matchMovies(movies, { name: "Alien: Romulus", year: 2024 });
  assert.deepEqual(hits.map((h) => h.stream_id), [4]);
});

test("matchMovies reuses its index for the same list object", () => {
  const m = createImdbMatcher();
  m.matchMovies(movies, { name: "Inception", year: 2010 });
  const before = m.indexBuilds;
  m.matchMovies(movies, { name: "Alien: Romulus", year: 2024 });
  assert.equal(m.indexBuilds, before, "index not rebuilt for same list");
  m.matchMovies([...movies], { name: "Inception", year: 2010 });
  assert.equal(m.indexBuilds, before + 1, "new list object triggers rebuild");
});

test("matchSeries matches by title without year strictness", () => {
  const m = createImdbMatcher();
  const series = [
    { series_id: 7, name: "Breaking Bad" },
    { series_id: 8, name: "Breaking Bad (Dubbed)" },
    { series_id: 9, name: "Breaking Badly Wrong" },
  ];
  assert.deepEqual(m.matchSeries(series, { name: "Breaking Bad" }).map((s) => s.series_id), [7, 8]);
});
