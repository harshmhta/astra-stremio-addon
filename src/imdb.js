const CINEMETA_BASE = "https://v3-cinemeta.strem.io";
const CINEMETA_TTL_MS = 24 * 3600 * 1000;
const CINEMETA_MAX_ENTRIES = 500;
const YEAR_TOLERANCE = 1;
const MAX_MATCHES = 10;

export function normalizeTitle(name) {
  return String(name || "")
    .replace(/[([{][^)\]}]*[)\]}]/g, " ") // drop (2024), (Tamil), [4K] style tags
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function titleYearOf(name) {
  const m = /\((19\d{2}|20\d{2})\)/.exec(String(name || ""));
  return m ? Number(m[1]) : null;
}

// Cinemeta ids: "tt1375666" (movie) or "tt0903747:5:14" (series episode)
export function parseCinemetaId(id) {
  const m = /^(tt\d+)(?::(\d+):(\d+))?$/.exec(String(id || ""));
  if (!m) return null;
  return { imdbId: m[1], season: m[2] ? Number(m[2]) : null, episode: m[3] ? Number(m[3]) : null };
}

export function createImdbMatcher() {
  // Index memoized on list identity: catalog lists are cached objects that
  // only change when the xtream client refreshes them.
  let indexedList = null;
  let index = null;
  const matcher = { indexBuilds: 0 };

  function indexFor(list, keyOf) {
    if (indexedList === list) return index;
    index = new Map();
    for (const item of list) {
      const key = normalizeTitle(item.name);
      if (!key) continue;
      const bucket = index.get(key);
      if (bucket) bucket.push(item);
      else index.set(key, [item]);
    }
    indexedList = list;
    matcher.indexBuilds += 1;
    return index;
  }

  matcher.matchMovies = (movies, { name, year }) => {
    const hits = indexFor(movies).get(normalizeTitle(name)) || [];
    const wanted = Number(year) || null;
    return hits
      .filter((it) => {
        if (!wanted) return true;
        const itemYear = titleYearOf(it.name);
        return itemYear === null || Math.abs(itemYear - wanted) <= YEAR_TOLERANCE;
      })
      .slice(0, MAX_MATCHES);
  };

  matcher.matchSeries = (series, { name }) => {
    const hits = indexFor(series).get(normalizeTitle(name)) || [];
    return hits.slice(0, MAX_MATCHES);
  };

  return matcher;
}

export function createCinemetaClient({ fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map();
  return async function cinemetaMeta(type, imdbId) {
    const key = `${type}:${imdbId}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < CINEMETA_TTL_MS) return hit.value;
    const res = await fetchImpl(`${CINEMETA_BASE}/meta/${type}/${imdbId}.json`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`cinemeta ${type}/${imdbId}: http ${res.status}`);
    const data = await res.json();
    const meta = data && data.meta;
    if (!meta || !meta.name) throw new Error(`cinemeta ${type}/${imdbId}: no meta`);
    const value = { name: meta.name, year: parseInt(meta.year, 10) || null };
    cache.delete(key);
    cache.set(key, { value, at: now() });
    while (cache.size > CINEMETA_MAX_ENTRIES) cache.delete(cache.keys().next().value);
    return value;
  };
}
