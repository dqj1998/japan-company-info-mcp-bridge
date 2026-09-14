#!/usr/bin/env bash
# One-shot status check for where japan-company-info-mcp-bridge / MCPOrb are listed.
# Read-only: only GETs public registry/directory APIs. No auth needed (gh optional).
#
# Usage: bash scripts/check-listings.sh   (or: npm run check:listings)

set -u
BRIDGE="japan-company-info-mcp-bridge"
SCOPE="@dqj1998/${BRIDGE}"
REG_NAME="io.github.dqj1998/${BRIDGE}"

j() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{$1}catch(e){console.log('  (parse error)')}})"; }

echo "== npm versions =="
for p in "$BRIDGE" "${SCOPE}-darwin-arm64" "${SCOPE}-linux-arm64" "${SCOPE}-linux-x64" "${SCOPE}-win32-x64"; do
  v=$(npm view "$p" version 2>/dev/null)
  printf "  %-52s %s\n" "$p" "${v:-MISSING}"
done

echo "== Official MCP Registry =="
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=japan-company-info" | \
  j "const l=(JSON.parse(d).servers||[]);const m=l.find(x=>((x.server||x).name)==='${REG_NAME}');console.log('  '+(m?('LISTED @ v'+((m.server||m).version||'?')):('not found (of '+l.length+' search hits)')))"

echo "== PulseMCP (auto-ingests from registry once reopened) =="
for q in japan-company-info MCPOrb; do
  curl -s "https://api.pulsemcp.com/v0beta/servers?query=${q}&count_per_page=5" | \
    j "const s=(JSON.parse(d).servers||[]);console.log('  ${q}: '+s.length+' result(s)'+(s.length?': '+s.map(x=>x.name||x.slug).join(', '):''))"
done

echo "== awesome-mcp-servers PRs (needs gh) =="
if command -v gh >/dev/null 2>&1; then
  for pr in 14392 14393; do
    gh pr view "$pr" --repo punkpeye/awesome-mcp-servers --json title,state,mergeStateStatus \
      -q "\"  #${pr} [\(.state)/\(.mergeStateStatus)] \(.title)\"" 2>/dev/null || echo "  #${pr}: (lookup failed)"
  done
else
  echo "  (gh not installed — check manually: https://github.com/punkpeye/awesome-mcp-servers/pulls)"
fi

echo "== Manual web checks (login/JS-gated, no API) =="
echo "  mcp.so        : https://mcp.so/  (search 'japan-company-info')"
echo "  Glama         : https://glama.ai/mcp/servers  (search 'japan-company-info')"
echo "  MCP.Directory : https://mcp.directory/  (search; claim if auto-listed)"
