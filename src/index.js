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
app.listen(port, "127.0.0.1", () => console.log(`stremio-xtream addon listening on 127.0.0.1:${port}`));
