#!/usr/bin/env bash
# Capture frames from one of the official ForestX CFHarvest training videos (EVIDENCE.md §B)
# into cfharvest/evidence/screenshots/<id>-<mm-ss>.png, one frame every N seconds.
# Usage: capture-frames.sh <youtubeId> [intervalSeconds=5]
set -euo pipefail
id="${1:?youtube id, e.g. kAa8RpLtyKM}"; every="${2:-5}"
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/evidence/screenshots"; mkdir -p "$out" "$root/evidence/video-notes"
tmp="$(mktemp -d)"
command -v yt-dlp >/dev/null || { echo "install yt-dlp (pip install yt-dlp)"; exit 1; }
command -v ffmpeg >/dev/null || { echo "install ffmpeg"; exit 1; }
yt-dlp -f "bv*[height<=1080]+ba/b" -o "$tmp/$id.%(ext)s" "https://www.youtube.com/watch?v=$id"
src="$(ls "$tmp"/$id.* | head -1)"
ffmpeg -loglevel error -i "$src" -vf "fps=1/$every" -frame_pts 1 "$out/$id-%04d.png"
# rename frame index → mm-ss
i=0; for f in "$out"/$id-[0-9][0-9][0-9][0-9].png; do s=$((i*every)); mv "$f" "$out/$id-$(printf '%02d-%02d' $((s/60)) $((s%60))).png"; i=$((i+1)); done
note="$root/evidence/video-notes/$id.md"
[ -f "$note" ] || printf '# %s\n\nSource: https://www.youtube.com/watch?v=%s\n\n## Screens observed\n\n## Controls / columns / statuses\n\n## Flow\n\n## Open questions resolved\n' "$id" "$id" > "$note"
echo "frames → $out ; notes → $note"
