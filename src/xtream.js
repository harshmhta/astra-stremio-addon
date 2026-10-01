import { httpGet } from "./httpGet.js";

const LIST_TTL_MS = 12 * 3600 * 1000;
const INFO_TTL_MS = 24 * 3600 * 1000;
const INFO_MAX_ENTRIES = 500;
const REQUEST_TIMEOUT_MS = 30_000;

export function createXtreamClient({ baseUrl, username, password, fetchImpl = httpGet, now = Date.now }) {
  const base = baseUrl.replace(/\/+$/, "");

  async function api(action, params = {}) {
    const url = new URL(base + "/player_api.php");
    url.searchParams.set("username", username);
    url.searchParams.set("password", password);
    url.searchParams.set("action", action);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    // The panel 302s info actions to another host, so redirects must be followed.
    const res = await fetchImpl(url.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`xtream ${action}: http ${res.status}`);
    return res.json();
  }

  function cachedList(action) {
    let value = null;
    let fetchedAt = 0;
    return async () => {
      if (value !== null && now() - fetchedAt < LIST_TTL_MS) return value;
      try {
        const fresh = await api(action);
        if (!Array.isArray(fresh)) throw new Error(`xtream ${action}: expected array`);
        value = fresh;
        fetchedAt = now();
        return value;
      } catch (err) {
        if (value !== null) return value; // stale beats down
        throw err;
      }
    };
  }

  const infoCache = new Map(); // insertion order doubles as eviction order
  async function cachedInfo(action, idParam, id) {
    const key = `${action}:${id}`;
    const hit = infoCache.get(key);
    if (hit && now() - hit.at < INFO_TTL_MS) return hit.value;
    const value = await api(action, { [idParam]: id });
    infoCache.delete(key);
    infoCache.set(key, { value, at: now() });
    while (infoCache.size > INFO_MAX_ENTRIES) infoCache.delete(infoCache.keys().next().value);
    return value;
  }

  return {
    getVodStreams: cachedList("get_vod_streams"),
    getSeries: cachedList("get_series"),
    getLiveStreams: cachedList("get_live_streams"),
    getVodCategories: cachedList("get_vod_categories"),
    getSeriesCategories: cachedList("get_series_categories"),
    getLiveCategories: cachedList("get_live_categories"),
    getVodInfo: (id) => cachedInfo("get_vod_info", "vod_id", id),
    getSeriesInfo: (id) => cachedInfo("get_series_info", "series_id", id),
    movieUrl: (streamId, ext) => `${base}/movie/${username}/${password}/${streamId}.${ext}`,
    episodeUrl: (episodeId, ext) => `${base}/series/${username}/${password}/${episodeId}.${ext}`,
    liveUrl: (streamId) => `${base}/live/${username}/${password}/${streamId}.ts`,
    xmltvUrl: () => `${base}/xmltv.php?username=${username}&password=${password}`,
  };
}
