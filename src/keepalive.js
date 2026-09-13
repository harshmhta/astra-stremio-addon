// Opt-in self-ping so a PaaS dyno that sleeps on idle (Heroku Eco) stays
// awake. Pings right away, then every interval; failures are logged only.
const DEFAULT_INTERVAL_MS = 20 * 60 * 1000; // Heroku Eco sleeps after 30 min idle

export function startKeepAlive({
  url,
  intervalMs = DEFAULT_INTERVAL_MS,
  fetchImpl = fetch,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  log = (msg) => console.error(msg),
} = {}) {
  if (!url) return () => {};
  const ping = () =>
    fetchImpl(url, { signal: AbortSignal.timeout(15_000) }).then(
      () => {},
      (err) => log(`[keepalive] ${url}: ${err.message}`),
    );
  ping();
  const timer = setIntervalImpl(ping, intervalMs);
  timer.unref?.();
  return () => clearIntervalImpl(timer);
}
