import test from "node:test";
import assert from "node:assert/strict";
import { buildCatalog, genreOptions } from "../src/catalog.js";

const categories = [
  { category_id: "1", category_name: "Action" },
  { category_id: "2", category_name: "Drama" },
  { category_id: "3", category_name: "Action" }, // duplicate name, different id
];

// 250 items: ids 0-99 in cat 1, 100-199 in cat 2, 200-249 in cat 3
const items = Array.from({ length: 250 }, (_, i) => ({
  stream_id: i,
  name: i === 42 ? "ALIEN: Romulus" : `Movie ${i}`,
  category_id: i < 100 ? "1" : i < 200 ? "2" : "3",
}));

const toPreview = (it) => ({ id: `xc:v:${it.stream_id}:mp4`, type: "movie", name: it.name });

test("paginates 100 per page via skip", () => {
  assert.equal(buildCatalog({ items, categories, extra: {}, toPreview }).metas.length, 100);
  assert.equal(buildCatalog({ items, categories, extra: { skip: "100" }, toPreview }).metas[0].id, "xc:v:100:mp4");
  assert.equal(buildCatalog({ items, categories, extra: { skip: "200" }, toPreview }).metas.length, 50);
  assert.equal(buildCatalog({ items, categories, extra: { skip: "9999" }, toPreview }).metas.length, 0);
});

test("genre filter matches every category sharing the name", () => {
  const r = buildCatalog({ items, categories, extra: { genre: "Action" }, toPreview });
  assert.equal(r.metas.length, 100); // 100 from cat1 + 50 from cat3, first page
  const all = buildCatalog({ items, categories, extra: { genre: "Action", skip: "100" }, toPreview });
  assert.equal(all.metas.length, 50);
});

test("search is a case-insensitive substring match", () => {
  const r = buildCatalog({ items, categories, extra: { search: "alien" }, toPreview });
  assert.equal(r.metas.length, 1);
  assert.equal(r.metas[0].name, "ALIEN: Romulus");
});

test("genre and search compose", () => {
  assert.equal(buildCatalog({ items, categories, extra: { genre: "Drama", search: "alien" }, toPreview }).metas.length, 0);
  assert.equal(buildCatalog({ items, categories, extra: { genre: "Action", search: "alien" }, toPreview }).metas.length, 1);
});

test("genreOptions dedupes and sorts names", () => {
  assert.deepEqual(genreOptions(categories), ["Action", "Drama"]);
});
