const PAGE_SIZE = 100;

export function genreOptions(categories) {
  const names = new Set();
  for (const c of categories || []) {
    if (typeof c.category_name === "string" && c.category_name.trim()) names.add(c.category_name.trim());
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function buildCatalog({ items, categories, extra = {}, toPreview }) {
  let filtered = items;

  if (extra.genre) {
    const ids = new Set(
      (categories || [])
        .filter((c) => (c.category_name || "").trim() === extra.genre)
        .map((c) => String(c.category_id)),
    );
    filtered = filtered.filter((it) => ids.has(String(it.category_id)));
  }

  if (extra.search) {
    const needle = extra.search.toLowerCase();
    filtered = filtered.filter((it) => (it.name || "").toLowerCase().includes(needle));
  }

  const skip = Math.max(0, parseInt(extra.skip, 10) || 0);
  return { metas: filtered.slice(skip, skip + PAGE_SIZE).map(toPreview) };
}
