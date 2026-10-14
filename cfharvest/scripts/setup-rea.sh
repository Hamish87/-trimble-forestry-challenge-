#!/usr/bin/env bash
# Install and verify REA (Reverse Engineer Anything) for this repository.
# Docs: https://github.com/morluto/rea/blob/main/docs/installation.md
set -euo pipefail

need_major=22
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt "$need_major" ]; then
  echo "REA needs Node >= 22.19 (found $(node --version)). Install Node 22 LTS (nvm install 22) and re-run." >&2
  exit 1
fi

echo "→ installing rea-agents globally"
npm install --global rea-agents

echo "→ REA doctor (read-only diagnostic)"
rea doctor --json || true

cat <<'EOF'

Next steps
  1. Register the MCP server with your coding agents (interactive, writes config with backups):
       npx -y rea-agents@latest setup
     Claude Code in this repo already picks REA up from .mcp.json.
  2. Optional, for APK string/label extraction (PLAN.md §3.3): install a JDK 17+ and follow
     docs/android-analysis.md in the REA repo to fetch the pinned jadx-headless jar.
  3. Optional, for passive web observation of a CFHarvest tenant you are authorised to use:
       google-chrome --remote-debugging-port=9222   # then: rea list-browser-targets
  4. Pin the version once evidence is produced:  npm install --global rea-agents@<version>
EOF
