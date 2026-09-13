import test from "node:test";
import assert from "node:assert/strict";
import { startKeepAlive } from "../src/keepalive.js";

test("pings immediately and then on every interval, and stops cleanly", async () => {
  const calls = [];
  const timers = [];
  const fetchImpl = async (url) => { calls.push(url); return new Response("{}"); };
  const setIntervalImpl = (fn, ms) => { timers.push({ fn, ms }); return { unref() {} }; };
  const stop = startKeepAlive({ url: "https://x/healthz", intervalMs: 1234, fetchImpl, setIntervalImpl, clearIntervalImpl: () => timers.push("cleared") });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(calls, ["https://x/healthz"], "one ping at startup");
  assert.equal(timers[0].ms, 1234);
  await timers[0].fn();
  assert.equal(calls.length, 2, "interval tick pings again");
  stop();
  assert.equal(timers.at(-1), "cleared");
});

test("a failed ping is logged, never thrown", async () => {
  const errors = [];
  const fetchImpl = async () => { throw new Error("net down"); };
  const setIntervalImpl = () => ({ unref() {} });
  startKeepAlive({ url: "https://x/healthz", fetchImpl, setIntervalImpl, log: (m) => errors.push(m) });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /net down/);
});

test("no url means no-op", () => {
  let scheduled = false;
  const stop = startKeepAlive({ url: "", setIntervalImpl: () => { scheduled = true; return { unref() {} }; } });
  assert.equal(scheduled, false);
  stop();
});
