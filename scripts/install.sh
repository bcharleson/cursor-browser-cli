#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT_DIR="$ROOT/extension"
CLI="$ROOT/cli/cursor-browser"
MCP="$ROOT/mcp/server.mjs"
VERSION="$(node -p "require('$EXT_DIR/package.json').version" 2>/dev/null || echo 1.0.0)"

echo "==> cursor-browser-cli install v${VERSION}"
echo "    root: $ROOT"

chmod +x "$CLI" "$MCP" "$ROOT/scripts/install.sh" 2>/dev/null || true

BIN_DIR="${HOME}/.local/bin"
mkdir -p "$BIN_DIR"
ln -sfn "$CLI" "$BIN_DIR/cursor-browser"
echo "    CLI:  $BIN_DIR/cursor-browser"

install_ext() {
  local target="$1"
  rm -rf "$target"
  mkdir -p "$target"
  cp "$EXT_DIR/package.json" "$EXT_DIR/extension.js" "$EXT_DIR/snapshot.js" "$target/"
  echo "    extension → $target"
}

# Current + common fallbacks (Cursor may keep old folder names loaded)
install_ext "${HOME}/.cursor/extensions/local.cursor-browser-cli-${VERSION}"
install_ext "${HOME}/.cursor/extensions/local.cursor-browser-cli-1.0.0"
# Migrate old bridge extension folders so reloads pick up new code
install_ext "${HOME}/.cursor/extensions/local.cursor-browser-bridge-0.3.0"
install_ext "${HOME}/.cursor/extensions/local.cursor-browser-bridge-0.2.0"
install_ext "${HOME}/.cursor/extensions/local.cursor-browser-bridge-0.1.0"

# Grok
if command -v grok >/dev/null 2>&1; then
  # remove old name if present
  grok mcp remove cursor-browser 2>/dev/null || true
  if grok mcp list 2>/dev/null | grep -qi 'cursor-browser'; then
    echo "    Grok MCP: already present"
  else
    grok mcp add cursor-browser -- node "$MCP" 2>/dev/null || \
      echo "    Tip: grok mcp add cursor-browser -- node \"$MCP\""
  fi
fi

# Claude Code tip
if command -v claude >/dev/null 2>&1; then
  echo "    Claude: claude mcp add cursor-browser -- node \"$MCP\""
fi

# Skills
for SKILL_ROOT in \
  "${HOME}/.grok/skills/cursor-browser" \
  "${HOME}/.claude/skills/cursor-browser" \
  "${HOME}/.agents/skills/cursor-browser"
do
  if mkdir -p "$SKILL_ROOT" 2>/dev/null; then
    cp "$ROOT/skill/SKILL.md" "$SKILL_ROOT/SKILL.md"
    echo "    skill → $SKILL_ROOT/SKILL.md"
  fi
done

echo ""
echo "Done."
echo "  1. Reload Cursor windows (Developer: Reload Window)"
echo "  2. cursor-browser windows"
echo "  3. cursor-browser --workspace <project> open https://example.com"
echo "  4. cursor-browser --workspace <project> snapshot"
echo ""
echo "MCP: node $MCP"
