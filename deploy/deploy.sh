#!/usr/bin/env bash
# Deploy/update the addon to your server.
# Target resolution: $1 > $DEPLOY_HOST env var > deploy/target.local file.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="${1:-${DEPLOY_HOST:-$(cat deploy/target.local 2>/dev/null || true)}}"
[ -n "$HOST" ] || { echo "usage: deploy.sh <server-ip-or-host>  (or put it in deploy/target.local)"; exit 1; }

rsync -az --delete src package.json package-lock.json "root@$HOST:/opt/stremio-xtream/"
ssh "root@$HOST" '
	set -e
	cd /opt/stremio-xtream
	npm ci --omit=dev --no-fund --no-audit
	chown -R stremio:stremio /opt/stremio-xtream
	systemctl restart stremio-xtream
	sleep 2
	systemctl is-active stremio-xtream
	curl -sf localhost:7000/healthz
	echo " deploy ok"
'
