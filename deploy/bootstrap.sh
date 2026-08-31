#!/usr/bin/env bash
# One-time droplet setup. Run as root: bootstrap.sh <https-host>
# Expects stremio-xtream.service and Caddyfile.tmpl in /tmp. Idempotent.
set -euo pipefail
HOST="${1:?usage: bootstrap.sh <https-host>}"
export DEBIAN_FRONTEND=noninteractive

# 1G swap — npm ci on a 512MB droplet OOMs without it
if ! swapon --show --noheadings | grep -q /swapfile; then
	fallocate -l 1G /swapfile
	chmod 600 /swapfile
	mkswap /swapfile
	swapon /swapfile
	echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v22* ]]; then
	curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
	apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null 2>&1; then
	apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
		gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >/etc/apt/sources.list.d/caddy-stable.list
	apt-get update
	apt-get install -y caddy
fi

id -u stremio >/dev/null 2>&1 || useradd --system --home /opt/stremio-xtream --shell /usr/sbin/nologin stremio
mkdir -p /opt/stremio-xtream
chown stremio:stremio /opt/stremio-xtream

install -m 644 /tmp/stremio-xtream.service /etc/systemd/system/stremio-xtream.service
sed "s/{HOST}/$HOST/" /tmp/Caddyfile.tmpl >/etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable stremio-xtream caddy
systemctl restart caddy
echo "bootstrap done for https://$HOST"
