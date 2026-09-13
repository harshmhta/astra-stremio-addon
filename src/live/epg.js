// XMLTV (xmltv.php) parsing + cache. Regex-based on purpose: the panel's
// file is regular, and this avoids an XML dependency.
const TTL_MS = 6 * 3600 * 1000;
const RETRY_MS = 15 * 60 * 1000;

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'" };
const decode = (s) => String(s || "").replace(/&(amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m] ?? m).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();

// "20260913082500 +0100" → ms since epoch
export function parseXmltvTime(ts) {
  const s = String(ts || "");
  const base = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10) || 0, +s.slice(10, 12) || 0, +s.slice(12, 14) || 0);
  const m = /([+-])(\d{2})(\d{2})\s*$/.exec(s.slice(14));
  if (!m) return base;
  const offset = (+m[2] * 60 + +m[3]) * 60000 * (m[1] === "-" ? -1 : 1);
  return base - offset;
}

const PROGRAMME = /<programme\s+start="([^"]+)"\s+stop="([^"]+)"\s+channel="([^"]+)"\s*>(.*?)<\/programme>/gs;
const TITLE = /<title[^>]*>(.*?)<\/title>/s;
const DESC = /<desc[^>]*>(.*?)<\/desc>/s;

export function parseXmltv(xml) {
  const map = new Map();
  for (const m of String(xml || "").matchAll(PROGRAMME)) {
    const start = parseXmltvTime(m[1]);
    const stop = parseXmltvTime(m[2]);
    if (!(stop > start)) continue;
    const title = decode((TITLE.exec(m[4]) || [])[1]);
    if (!title) continue;
    const desc = decode((DESC.exec(m[4]) || [])[1]);
    const entry = { start, stop, title, desc };
    const list = map.get(m[3]);
    if (list) list.push(entry);
    else map.set(m[3], [entry]);
  }
  for (const list of map.values()) list.sort((a, b) => a.start - b.start);
  return map;
}

export function createEpg({ url, fetchImpl = fetch, now = Date.now, log = (m) => console.error(m) }) {
  let map = new Map();
  let loadedAt = 0;
  let failedAt = 0;
  let loading = null;

  async function load() {
    const res = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`epg http ${res.status}`);
    const next = parseXmltv(await res.text());
    if (next.size === 0) throw new Error("epg empty");
    map = next;
    loadedAt = now();
  }

  return {
    async ready() {
      if (loadedAt && now() - loadedAt < TTL_MS) return;
      if (failedAt && now() - failedAt < RETRY_MS) return;
      loading ??= load()
        .catch((err) => { failedAt = now(); log(`[epg] load failed: ${err.message}`); })
        .finally(() => { loading = null; });
      await loading;
    },
    programmes: (epgId) => map.get(epgId) || [],
    overlapping(epgId, startMs, stopMs) {
      return (map.get(epgId) || []).filter((p) => p.start < stopMs && p.stop > startMs);
    },
    nowNext(epgId, atMs = now()) {
      const list = map.get(epgId) || [];
      const i = list.findIndex((p) => p.start <= atMs && atMs < p.stop);
      return { now: i >= 0 ? list[i] : null, next: i >= 0 ? list[i + 1] || null : list.find((p) => p.start > atMs) || null };
    },
    size: () => map.size,
  };
}
