#!/usr/bin/env bash
# Assemble the static site for hosting (Vercel output directory "site").
# Layout mirrors the single-server dev setup: /dist/ = the game, /cfharvest/app/ = the planning replica,
# /cfharvest/machine/ = the on-board (Maskin) client, /cfharvest/sitecheck/ = the drone site check.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/site"
rm -rf "$out"; mkdir -p "$out/cfharvest"
cp -R "$root/dist" "$out/dist"
cp -R "$root/cfharvest/app" "$out/cfharvest/app"
cp -R "$root/cfharvest/machine" "$out/cfharvest/machine"
cp -R "$root/cfharvest/sitecheck" "$out/cfharvest/sitecheck"
test -s "$out/dist/scenes.js" || { echo "dist/scenes.js missing — run npm run build first" >&2; exit 1; }
cat > "$out/index.html" <<'EOF'
<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/dist/"><title>Trimble Forestry Forst Challenge</title><a href="/dist/">Zum Spiel</a>
EOF
echo "site assembled: $(find "$out" -type f | wc -l) files, $(du -sh "$out" | cut -f1)"
