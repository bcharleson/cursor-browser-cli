#!/usr/bin/env bash
# Install Cursor Browser Bridge: extension + CLI + optional MCP for Grok/Claude
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT_DIR="$ROOT/extension"
CLI="$ROOT/cli/cursor-browser"
MCP="$ROOT/mcp/server.mjs"
VERSION="$(node -p "require('$EXT_DIR/package.json').version" 2>/dev/null || echo 0.3.0)"

echo "==> cursor-browser-bridge install v${VERSION}"
echo "    root: $ROOT"

chmod +x "$CLI" "$MCP" "$ROOT/scripts/install.sh" 2>/dev/null || true

# CLI
BIN_DIR="${HOME}/.local/bin"
mkdir -p "$BIN_DIR"
ln -sfn "$CLI" "$BIN_DIR/cursor-browser"
echo "    CLI:  $BIN_DIR/cursor-browser"

# Extension (unpacked) — current + legacy folder names Cursor may already load
install_ext() {
  local target="$1"
  rm -rf "$target"
  mkdir -p "$target"
  cp "$EXT_DIR/package.json" "$EXT_DIR/extension.js" "$target/"
  echo "    extension → $target"
}

install_ext "${HOME}/.cursor/extensions/local.cursor-browser-bridge-${VERSION}"
install_ext "${HOME}/.cursor/extensions/local.cursor-browser-bridge-0.1.0"
install_ext "${HOME}/.cursor/extensions/local.cursor-browser-bridge-0.2.0"

# Grok MCP
if command -v grok >/dev/null 2>&1; then
  if grok mcp list 2>/dev/null | grep -qi 'cursor-browser'; then
    echo "    Grok MCP: cursor-browser already configured"
  else
    echo "    Adding Grok MCP server 'cursor-browser'..."
    grok mcp add cursor-browser -- node "$MCP" || true
  fi
else
  echo "    (grok CLI not found — skip Grok MCP)"
fi

# Claude Code MCP (optional)
if command -v claude >/dev/null 2>&1; then
  if claude mcp list 2>/dev/null | grep -qi 'cursor-browser'; then
    echo "    Claude MCP: cursor-browser already configured"
  else
    echo "    Tip: claude mcp add cursor-browser -- node \"$MCP\""
  fi
fi

# Grok skill
SKILL_DIR="${HOME}/.grok/skills/cursor-browser"
if [ -d "${HOME}/.grok/skills" ] || mkdir -p "$SKILL_DIR" 2>/dev/null; then
  mkdir -p "$SKILL_DIR"
  cp "$ROOT/skill/SKILL.md" "$SKILL_DIR/SKILL.md"
  echo "    Grok skill: $SKILL_DIR/SKILL.md"
fi

echo ""
echo "Done. Next:"
echo "  1. Reload each Cursor window (Developer: Reload Window)"
echo "  2. cursor-browser windows"
echo "  3. cursor-browser --workspace <project> open https://example.com"
echo "  4. cursor-browser --workspace <project> inspect"
echo "  5. cursor-browser --workspace <project> snap /tmp/out.png"
echo ""
echo "MCP (any client):"
echo "  node $MCP"
echo ""
echo "Claude Code:"
echo "  claude mcp add cursor-browser -- node $MCP"
