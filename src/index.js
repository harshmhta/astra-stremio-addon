import { createXtreamClient } from "./xtream.js";
import { createApp } from "./server.js";
import { startKeepAlive } from "./keepalive.js";
import { createEpg } from "./live/epg.js";
import { createEspn } from "./live/fixtures/espn.js";
import { createEspnHeader } from "./live/fixtures/espnHeader.js";
import { createSportsDb } from "./live/fixtures/thesportsdb.js";
import { createSportsEngine } from "./live/sports.js";
import { teamsFromEnv } from "./live/taxonomy.js";

const required = (name) => {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}`);
    process.exit(1);
  }
  return v;
};

const xtream = createXtreamClient({
  baseUrl: required("XC_BASE_URL"),
  username: required("XC_USERNAME"),
  password: required("XC_PASSWORD"),
});

const off = (v) => /^(0|false|off|no)$/i.test(v || "");
const fixturesOn = !off(process.env.SPORTS_FIXTURES);
const live = off(process.env.LIVE_API)
  ? null
  : createSportsEngine({
      xtream,
      epg: createEpg({ url: xtream.xmltvUrl() }),
      espn: fixturesOn ? createEspn() : { events: async () => [] },
      espnHeader: fixturesOn ? createEspnHeader() : { events: async () => [] },
      sportsDb: createSportsDb(),
      config: {
        teams: teamsFromEnv(process.env.MY_TEAMS),
        regionOrder: (process.env.FEED_REGION_ORDER || "UK,US,IN,CA,other").split(",").map((s) => s.trim()).filter(Boolean),
      },
    });

const app = createApp({
  xtream,
  live,
  config: {
    secret: required("ADDON_SECRET"),
    addonName: process.env.ADDON_NAME || "Astra",
    liveTv: !off(process.env.LIVE_TV),
    liveApi: live !== null,
  },
});

const port = Number(process.env.PORT || 7000);
// Behind a reverse proxy (the VPS setup) bind loopback only; on a PaaS like
// Heroku (which sets DYNO) the router needs to reach us on all interfaces.
const host = process.env.HOST || (process.env.DYNO ? "0.0.0.0" : "127.0.0.1");
app.listen(port, host, () => console.log(`astra listening on ${host}:${port}`));

// KEEPALIVE_URL=https://<your-app>.herokuapp.com/healthz keeps a sleepy Eco dyno awake
startKeepAlive({ url: process.env.KEEPALIVE_URL });
