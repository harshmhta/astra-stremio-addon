import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { httpGet } from "../src/httpGet.js";

async function serve(handler) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

test("reads a large close-delimited body like an Xtream panel sends", async () => {
  const items = Array.from({ length: 50_000 }, (_, i) => ({ stream_id: i, name: `Movie ${i}` }));
  const payload = JSON.stringify(items);
  const s = await serve((req, res) => {
    // No Content-Length, no chunking: body ends when the socket closes.
    res.socket.write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n");
    res.socket.end(payload);
  });
  try {
    const res = await httpGet(`${s.base}/player_api.php`);
    assert.equal(res.ok, true);
    const list = await res.json();
    assert.equal(list.length, 50_000);
    assert.equal(list[49_999].name, "Movie 49999");
  } finally {
    await s.close();
  }
});

test("follows redirects and reports non-2xx status", async () => {
  const s = await serve((req, res) => {
    if (req.url === "/start") return res.writeHead(302, { Location: "/end" }).end();
    if (req.url === "/end") return res.writeHead(200).end('{"ok":1}');
    res.writeHead(404).end("nope");
  });
  try {
    const res = await httpGet(`${s.base}/start`);
    assert.deepEqual(await res.json(), { ok: 1 });
    const missing = await httpGet(`${s.base}/missing`);
    assert.equal(missing.ok, false);
    assert.equal(missing.status, 404);
  } finally {
    await s.close();
  }
});

test("aborts via signal", async () => {
  const s = await serve(() => {}); // never responds
  try {
    await assert.rejects(httpGet(`${s.base}/hang`, { signal: AbortSignal.timeout(50) }));
  } finally {
    s.close();
  }
});
