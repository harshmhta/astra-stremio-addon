import { networkOf, networkRegion } from "./networks.js";

export { networkOf };

// Ordered prefix table: first match wins. Tested against the raw name.
const REGION_PREFIXES = [
  ["UK", /^(uk|gb)\s*[:|\-]/i],
  ["US", /^(us|usa)\s*[:|(\-]/i],
  ["IN", /^(in|ind)\s*[:|\-]/i],
  ["CA", /^ca[\s\-(:]/i],
  ["AU", /^au\s*[:|\-]/i],
  ["ZA", /^(za|dstv)\s*[:|\-]/i],
  ["PT", /^pt\s*[:|\-]/i],
  ["NO", /^no\s*[:|\-]/i],
  ["AR", /^(ar|arabic)\s*[:|\-]/i],
];

const CATEGORY_REGION = [
  ["UK", /\buk\b|sky uk/i],
  ["IN", /\bindia\b/i],
  ["US", /\busa?\b/i],
  ["CA", /\bcanada\b/i],
  ["AU", /australia/i],
  ["ZA", /dstv|south africa/i],
];

// Prefixes for markets we don't rank; they beat network inference so a
// Brazilian "FOX Sports 1" or Caribbean "ESPN" isn't mistaken for a US feed.
const FOREIGN_PREFIX = /^(carib|ph|br|ru|de|fr|es|it|nl|se|dk|fi|pl|tr|gr|bg|ro|hu|cz|hr|rs|mx|cl|co|pe|lat|nz|ie|tm|pk|bd|lk|my|sg|id|th|vn|kr|jp|cn|hk|tw|ex-yu)\b|^\([a-z]{2}\)/i;

export function regionOf(name, category = "") {
  for (const [region, re] of REGION_PREFIXES) if (re.test(name)) return region;
  if (FOREIGN_PREFIX.test(name)) return "other";
  const byNetwork = networkRegion(networkOf(name));
  if (byNetwork) return byNetwork;
  for (const [region, re] of CATEGORY_REGION) if (re.test(category || "")) return region;
  return "other";
}

export function qualityOf(name, category = "") {
  const n = `${name} ${category}`.toLowerCase().replace(/⁴ᵏ/g, " 4k ").replace(/ᶠᴴᴰ/g, " fhd ").replace(/ᴴᴰ/g, " hd ");
  if (/\b(4k|2160p?|uhd)\b/.test(n)) return "4k";
  if (/\b(fhd|1080p?)\b/.test(n)) return "fhd";
  if (/\b(hd|720p?)\b|hevc|h\.?265/.test(n)) return "hd";
  return "sd";
}

const EVENT_CATEGORY = /live event|ppv|league pass|live only/i;
const EVENT_NAME = /\bvs\.?\b|\bv\b.*\d|league pass|\|.*\b(mon|tue|wed|thu|fri|sat|sun)\b|\d{4}-\d{2}-\d{2}|\b\d{1,2}:\d{2}\s?(am|pm)\b/i;
const DIVIDER = /[#=]{3,}|^-{3,}/;

export function isEventChannel(name, category = "") {
  if (DIVIDER.test(name)) return false;
  if (EVENT_CATEGORY.test(category || "")) return true;
  return EVENT_NAME.test(name);
}

export function buildChannelIndex(liveList, categories, urlFor) {
  const catName = new Map((categories || []).map((c) => [String(c.category_id), c.category_name]));
  const out = [];
  for (const c of liveList || []) {
    const name = String(c.name || "").trim();
    if (!name || DIVIDER.test(name)) continue;
    const category = catName.get(String(c.category_id)) || null;
    out.push({
      streamId: String(c.stream_id),
      name,
      region: regionOf(name, category),
      quality: qualityOf(name, category),
      network: networkOf(name),
      categoryId: String(c.category_id),
      category,
      logo: c.stream_icon || null,
      isEvent: isEventChannel(name, category),
      epgId: c.epg_channel_id || null,
      url: urlFor(String(c.stream_id)),
    });
  }
  return out;
}
