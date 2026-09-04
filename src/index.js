import { createXtreamClient } from "./xtream.js";
import { createApp } from "./server.js";

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

const app = createApp({
  xtream,
  config: {
    secret: required("ADDON_SECRET"),
    addonName: process.env.ADDON_NAME || "Astra",
  },
});

const port = Number(process.env.PORT || 7000);
// Behind a reverse proxy (the VPS setup) bind loopback only; on a PaaS like
// Heroku (which sets DYNO) the router needs to reach us on all interfaces.
const host = process.env.HOST || (process.env.DYNO ? "0.0.0.0" : "127.0.0.1");
app.listen(port, host, () => console.log(`astra listening on ${host}:${port}`));
