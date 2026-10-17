#!/bin/sh
# Holztransport demo · Vercel build step: copies the static app to dist/ and writes config.js from the environment,
# so the Mapbox public token lives in the Vercel project settings (MAPBOX_TOKEN, optional MAPBOX_STYLE) instead of git.
# Locally: MAPBOX_TOKEN=pk.… sh transport/scripts/vercel-build.sh && npx serve transport/dist   (or use Verwaltung → Einstellungen)
set -eu
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist
for f in * .[!.]*; do case "$f" in dist|scripts|node_modules|'*'|'.[!.]*'|.vercel|.DS_Store) ;; *) cp -R "$f" dist/;; esac; done
TOKEN="${MAPBOX_TOKEN:-}"; STYLE="${MAPBOX_STYLE:-outdoors}"
case "$TOKEN" in *[!A-Za-z0-9._-]*) echo "MAPBOX_TOKEN contains unexpected characters" >&2; exit 1;; esac
case "$STYLE" in outdoors|satellite|streets|light) ;; *) echo "MAPBOX_STYLE must be outdoors, satellite, streets or light" >&2; exit 1;; esac
cat > dist/config.js <<JS
/* Holztransport demo · generated at build time by scripts/vercel-build.sh from MAPBOX_TOKEN / MAPBOX_STYLE — the
   repository's config.js documents the fields. A public Mapbox token is shipped to browsers by design; restrict it by URL. */
globalThis.TransportConfig=Object.assign({mapboxToken:'${TOKEN}',mapboxStyle:'${STYLE}'},globalThis.TransportConfig||{});
JS
if [ -n "$TOKEN" ]; then echo "config.js written with a Mapbox token (${#TOKEN} chars), style ${STYLE}"; else echo "config.js written without a Mapbox token: built-in tile map"; fi
