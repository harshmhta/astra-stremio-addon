# Astra

**Self-hosted Stremio addon for your Xtream Codes IPTV subscription.**

If your IPTV provider gave you a panel URL + username + password (the
"Xtream Codes API" almost every provider uses), Astra turns that
subscription into first-class Stremio catalogs:

- 🎬 **Movies & Series** — your provider's full VOD library as browsable
  catalogs with genre filters, search, posters, and detail pages
- ⭐ **IMDb integration** — open any title on Stremio's built-in pages and
  Astra offers your IPTV's copy as a stream, matched by title + year
  (multiple copies show up as multiple quality/language options)
- 📺 **Live TV** — every channel with genre filters and search; channel
  logos come from your panel, with gaps auto-filled from the
  [iptv-org](https://github.com/iptv-org/database) database
- ⏭️ **Binge mode** — "next episode" auto-plays and sticks to the same
  version you were watching
- 🪶 **Tiny** — one Node.js process, a single dependency (Express), runs
  happily on the cheapest $4/mo VPS; video streams go **direct** from your
  provider to your player and never touch your server

> **Bring your own subscription.** Astra ships no content and no
> credentials. It is a private bridge between *your* IPTV account and
> *your* Stremio — like pointing VLC at an M3U, with a much nicer UI.

## How it works

```
Stremio ──HTTPS──▶ Caddy ──▶ Astra (Node) ──▶ your Xtream panel (JSON API)
   │                                                     │
   └────────────── video stream (direct) ◀───────────────┘
```

Astra implements the [Stremio addon protocol](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/protocol.md)
— four JSON routes (`manifest`, `catalog`, `meta`, `stream`) served under a
secret path. Catalog lists are cached in memory for 12 h, so your panel
sees almost no traffic.

## Quick start (local, 2 minutes)

Requires Node.js ≥ 22.9.

```bash
git clone https://github.com/harshmhta/astra-stremio-addon.git
cd astra-stremio-addon
npm install
cp .env.example .env    # then edit .env with your panel URL + credentials
npm start
```

Open `http://127.0.0.1:7000/<your-ADDON_SECRET>/manifest.json` — if you see
JSON, it works. You can install that URL in Stremio Desktop on the same
machine right away. For phones, TVs, and Stremio Web you need HTTPS — so
put it on a server:

## Deploy to Heroku (easiest, ~5 minutes)

Heroku gives you HTTPS, restarts, and deploys out of the box — nothing to
administer. A Basic dyno is ~$7/mo and never sleeps. The Eco plan is $5/mo
for 1,000 dyno-hours but sleeps after 30 min idle — to run Astra on Eco,
set `KEEPALIVE_URL` to your app's `/healthz` URL and it pings itself every
20 minutes (a single always-on dyno uses ~744 of your 1,000 hours).

**One click:**

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/harshmhta/astra-stremio-addon)

Fill in your panel URL, username, and password on the form (the addon
secret is generated for you), hit *Deploy app*, then read `ADDON_SECRET`
from the app's *Settings → Config Vars*. Your addon URL is:

```
https://<your-app-name>.herokuapp.com/<ADDON_SECRET>/manifest.json
```

**Or from the CLI:**

```bash
heroku create my-astra
heroku config:set XC_BASE_URL=http://panel.example.com:8080 XC_USERNAME=... XC_PASSWORD=... ADDON_SECRET=$(openssl rand -hex 12)
git push heroku main
heroku config:get ADDON_SECRET   # → goes into the URL above
```

Update later with `git pull && git push heroku main`.

## Deploy to your own VPS (DigitalOcean example, ~15 minutes)

Any Ubuntu 24.04 VPS works the same way; DigitalOcean's $4/mo droplet
(512 MB) is more than enough.

**1. Create the server** — Ubuntu 24.04, cheapest size, add your SSH key.
Note its public IP. (Optional but smart: restrict inbound traffic to ports
22/80/443 with your provider's firewall.)

**2. Pick your HTTPS hostname.** No domain needed:
[sslip.io](https://sslip.io) gives every IP a free hostname — for IP
`203.0.113.7` it's `203-0-113-7.sslip.io` (dots → dashes). Own a domain?
Point an A record at the server and use that instead.

**3. Bootstrap the server** (installs Node 22, Caddy with automatic
Let's Encrypt HTTPS, a systemd service, and a swapfile — idempotent):

```bash
scp deploy/bootstrap.sh deploy/stremio-xtream.service deploy/Caddyfile.tmpl root@YOUR_IP:/tmp/
ssh root@YOUR_IP 'bash /tmp/bootstrap.sh YOUR-IP-DASHED.sslip.io'
```

**4. Put your credentials on the server** (and only there). Fill in a
local `.env` first (`cp .env.example .env`), then:

```bash
ssh root@YOUR_IP 'cat > /opt/stremio-xtream/.env && chmod 600 /opt/stremio-xtream/.env && chown stremio:stremio /opt/stremio-xtream/.env' < .env
```

**5. Deploy the code:**

```bash
echo YOUR_IP > deploy/target.local   # remembered for future deploys
./deploy/deploy.sh
```

**6. Install in Stremio** — in Stremio, go to Addons and paste into the
search box:

```
https://YOUR-IP-DASHED.sslip.io/<your-ADDON_SECRET>/manifest.json
```

Done. The service restarts itself on crashes and comes back on reboot.

## Configuration

| Variable | Required | What it is |
|---|---|---|
| `XC_BASE_URL` | ✅ | Your panel, e.g. `http://panel.example.com:8080` |
| `XC_USERNAME` | ✅ | Panel username |
| `XC_PASSWORD` | ✅ | Panel password |
| `ADDON_SECRET` | ✅ | Random string in your addon URL — the only lock on your addon. `openssl rand -hex 12` |
| `ADDON_NAME` | | Name shown in Stremio (default `Astra`) |
| `LIVE_TV` | | Set to `false` to hide the Live TV catalog (movies + series only) |
| `KEEPALIVE_URL` | | Public URL the app pings every 20 min to stay awake, e.g. `https://my-astra.herokuapp.com/healthz` (for Heroku Eco dynos) |
| `LIVE_API` | | Set to `false` to disable the Live/Sports API below (default on) |
| `SPORTS_FIXTURES` | | `off` disables the ESPN fixture/score sources (default on) |
| `MY_TEAMS` | | Comma list of team ids for the Live/Sports API (`penn-state,real-madrid,liverpool,al-nassr,mumbai-indians,india-cricket`) |
| `FEED_REGION_ORDER` | | Preferred feed regions, e.g. `UK,US,IN,CA,other` |
| `PORT` | | Listen port (default `7000`; Heroku sets it) |
| `HOST` | | Bind address (default `127.0.0.1` behind a reverse proxy, `0.0.0.0` on Heroku) |

## Live/Sports API (for the Astra TV app)

Separate from the Stremio routes and never referenced by the manifest, the
server also exposes a sports-first JSON API under the same secret path,
built for the [Astra TV](https://github.com/harshmhta/astra-tv) Android TV
app. Fixtures, scores, clocks and team logos come from the internet (ESPN's
public scoreboard, TheSportsDB for cricket teams); your panel only supplies
the *feeds*, ranked by evidence — an EPG programme naming the teams beats a
broadcaster-map guess, which beats a panel event channel whose name merely
matches (those go stale).

```
GET /<secret>/api/v1/home?teams=liverpool,india-cricket   # everything Home needs
GET /<secret>/api/v1/events?sport=soccer                  # live + next 7 days
GET /<secret>/api/v1/events/<id>                          # one event, fresh feeds
GET /<secret>/api/v1/channels?sport=cricket               # sports networks, UK first
GET /<secret>/api/v1/teams                                # known team ids + badges
GET /<secret>/api/v1/search?q=liverpool
```

Every feed carries a direct stream URL. ESPN's endpoint is unofficial: if
it ever breaks, the API degrades to EPG-only "live now" rows rather than
failing. Live TV in Stremio (`LIVE_TV`) is independent of this API.

## Operating

```bash
./deploy/deploy.sh                        # ship current code + restart
ssh root@YOUR_IP journalctl -u stremio-xtream -f   # tail logs
npm test                                  # run the test suite locally
```

**Rotate your secret** (e.g. you leaked your addon URL): change
`ADDON_SECRET` in `/opt/stremio-xtream/.env` on the server,
`systemctl restart stremio-xtream`, reinstall the addon with the new URL.

## FAQ

**Streams won't play / cut off when I open a second one.** Most IPTV plans
allow 1–2 concurrent connections. Live TV + a movie at the same time
counts as two.

**Some live channels don't play.** Panels are full of event-only and dead
channels. They fail harmlessly; pick another.

**My addon shows at the bottom of the stream list.** Stremio orders
stream results by addon *install order*, not name. Reinstall your other
streaming addons and they'll drop below this one.

**Is my addon URL public?** It's as public as you make it. There's no
auth besides the secret path — anyone with the full URL can browse and
stream on your account. Don't share it.

**Why not Docker?** On a 512 MB box, bare systemd + Caddy leaves more RAM
for catalog caching. PRs welcome if you want a Dockerfile.

## Project layout

- [`src/xtream.js`](src/xtream.js) — Xtream API client (12 h list cache, 24 h info cache, stale-on-error)
- [`src/mappers.js`](src/mappers.js) — Xtream JSON → Stremio metas/streams
- [`src/catalog.js`](src/catalog.js) — genre filter, search, pagination
- [`src/imdb.js`](src/imdb.js) — `tt` id → title/year via Cinemeta, matched against your library
- [`src/logos.js`](src/logos.js) — fallback channel logos from iptv-org
- [`src/server.js`](src/server.js) — the addon HTTP routes
- [`deploy/`](deploy/) — bootstrap + deploy scripts, systemd unit, Caddyfile
- [`test/`](test/) — `node --test` suite with fixtures from a real panel

## License

[MIT](LICENSE). Astra is a client for a subscription you already pay for;
what your provider streams is between you and them.
