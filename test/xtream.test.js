import test from "node:test";
import assert from "node:assert/strict";
import { createXtreamClient } from "../src/xtream.js";

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    return new Response(JSON.stringify(handler(url, calls.length)), { status: 200 });
  };
  fn.calls = calls;
  return fn;
}

const cfg = { baseUrl: "http://x:8080", username: "U", password: "P" };

test("getVodStreams builds the right URL and caches within TTL", async () => {
  const fetchImpl = fakeFetch(() => [{ stream_id: 1 }]);
  const c = createXtreamClient({ ...cfg, fetchImpl });
  const list = await c.getVodStreams();
  assert.equal(list.length, 1);
  const u = new URL(fetchImpl.calls[0]);
  assert.equal(u.origin + u.pathname, "http://x:8080/player_api.php");
  assert.equal(u.searchParams.get("username"), "U");
  assert.equal(u.searchParams.get("password"), "P");
  assert.equal(u.searchParams.get("action"), "get_vod_streams");
  await c.getVodStreams();
  assert.equal(fetchImpl.calls.length, 1, "second call served from cache");
});

test("list cache refreshes after TTL expiry", async () => {
  let t = 0;
  const fetchImpl = fakeFetch((_, n) => [{ n }]);
  const c = createXtreamClient({ ...cfg, fetchImpl, now: () => t });
  await c.getSeries();
  t = 12 * 3600 * 1000 + 1;
  const list = await c.getSeries();
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(list[0].n, 2);
});

test("list cache serves stale value when refresh fails", async () => {
  let t = 0;
  let fail = false;
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (fail) throw new Error("boom");
    return new Response(JSON.stringify([{ good: true }]), { status: 200 });
  };
  const c = createXtreamClient({ ...cfg, fetchImpl, now: () => t });
  await c.getVodStreams();
  t = 13 * 3600 * 1000;
  fail = true;
  const list = await c.getVodStreams();
  assert.equal(list[0].good, true, "stale value returned on upstream failure");
  assert.equal(calls.length, 2, "refresh was attempted");
});

test("non-array list response is treated as an error", async () => {
  const fetchImpl = fakeFetch(() => ({ user_info: { auth: 0 } }));
  const c = createXtreamClient({ ...cfg, fetchImpl });
  await assert.rejects(() => c.getVodStreams());
});

test("info cache caps at 500 entries, evicting the oldest", async () => {
  const fetchImpl = fakeFetch((url) => ({ id: new URL(url).searchParams.get("vod_id") }));
  const c = createXtreamClient({ ...cfg, fetchImpl });
  for (let i = 0; i <= 500; i++) await c.getVodInfo(i);
  assert.equal(fetchImpl.calls.length, 501);
  await c.getVodInfo(500); // still cached
  assert.equal(fetchImpl.calls.length, 501);
  await c.getVodInfo(0); // evicted → refetch
  assert.equal(fetchImpl.calls.length, 502);
});

test("stream URL helpers", () => {
  const c = createXtreamClient({ ...cfg, fetchImpl: fakeFetch(() => []) });
  assert.equal(c.movieUrl(5, "mkv"), "http://x:8080/movie/U/P/5.mkv");
  assert.equal(c.episodeUrl(7, "mp4"), "http://x:8080/series/U/P/7.mp4");
});
