const CHANNELS_URL = "https://iptv-org.github.io/api/channels.json";
const LOGOS_URL = "https://iptv-org.github.io/api/logos.json";
const INDEX_TTL_MS = 7 * 24 * 3600 * 1000;
const FAILURE_RETRY_MS = 3600 * 1000;
const QUALITY_TOKENS = /\b(4k|8k|uhd|fhd|hd|sd|hevc|h26[45]|1080p?|720p?|50fps|raw|vip|backup|low|hq)\b/g;

export function normalizeChannelName(name) {
  return String(name || "")
    .replace(/^[A-Za-z]{2,4}\s*[:\-|]\s*/, "") // "IN:", "UK |" prefixes
    .replace(/[([{][^)\]}]*[)\]}]/g, " ") // bracketed tags: (4K), (V+), [backup]
    .toLowerCase()
    .replace(QUALITY_TOKENS, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function countryHintOf(name) {
  const m = /^(?:\(([A-Za-z]{2})\)|([A-Za-z]{2})\s*[:\-|])/.exec(String(name || ""));
  const code = m && (m[1] || m[2]);
  return code ? code.toUpperCase() : null;
}

export function createLogoResolver({ fetchImpl = fetch, now = Date.now } = {}) {
  let index = null; // Map<normalized name, Array<{country, logo}>>
  let loadedAt = 0;
  let failedAt = 0;
  let loading = null;

  async function getJson(url) {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`${url}: http ${res.status}`);
    return res.json();
  }

  async function load() {
    const [channels, logos] = await Promise.all([getJson(CHANNELS_URL), getJson(LOGOS_URL)]);
    const logoById = new Map();
    for (const l of logos) {
      if (!l?.url || !l.in_use) continue;
      const cur = logoById.get(l.channel);
      if (!cur || (l.width || 0) > (cur.width || 0)) logoById.set(l.channel, l);
    }
    const next = new Map();
    for (const c of channels) {
      const logo = logoById.get(c.id);
      if (!logo) continue;
      for (const n of [c.name, ...(c.alt_names || [])]) {
        const key = normalizeChannelName(n);
        if (!key) continue;
        const entry = { country: c.country, logo: logo.url };
        const bucket = next.get(key);
        if (bucket) bucket.push(entry);
        else next.set(key, [entry]);
      }
    }
    index = next;
    loadedAt = now();
  }

  return {
    // Loads (or refreshes) the index; never throws — on failure the resolver
    // just answers null until the retry window elapses.
    async ready() {
      if (index && now() - loadedAt < INDEX_TTL_MS) return;
      if (failedAt && now() - failedAt < FAILURE_RETRY_MS) return;
      loading ??= load()
        .catch((err) => {
          failedAt = now();
          console.error(`[logos] index load failed: ${err.message}`);
        })
        .finally(() => {
          loading = null;
        });
      await loading;
    },
    resolve(name) {
      if (!index) return null;
      const candidates = index.get(normalizeChannelName(name));
      if (!candidates?.length) return null;
      const hint = countryHintOf(name);
      const pick = (hint && candidates.find((c) => c.country === hint)) || candidates[0];
      return pick.logo;
    },
  };
}
