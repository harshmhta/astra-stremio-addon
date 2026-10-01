import http from "node:http";
import https from "node:https";

const MAX_REDIRECTS = 5;

// Minimal fetch-shaped GET on node:http. Xtream panels send huge lists
// (get_vod_streams can be 70 MB+) with `Connection: close` and no length, so
// the body ends when the socket closes. Node's built-in fetch (undici) can hit
// an internal `assert(!this.paused)` on that path, which throws from a socket
// handler and kills the process — no try/catch can stop it. node:http can't.
export function httpGet(url, { signal, redirectsLeft = MAX_REDIRECTS } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === "https:" ? https : http;
    const req = lib.get(target, { signal }, (res) => {
      const status = res.statusCode;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error(`too many redirects: ${url}`));
        const next = new URL(res.headers.location, target).toString();
        return resolve(httpGet(next, { signal, redirectsLeft: redirectsLeft - 1 }));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("error", reject);
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve({
          ok: status >= 200 && status < 300,
          status,
          text: async () => body,
          json: async () => JSON.parse(body),
        });
      });
    });
    req.on("error", reject);
  });
}
