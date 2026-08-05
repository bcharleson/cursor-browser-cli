#!/usr/bin/env bash
# Install Cursor Browser Bridge extension + optional CLI symlink + Grok MCP entry
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT_DIR="$ROOT/extension"
CLI="$ROOT/cli/cursor-browser"
MCP="$ROOT/mcp/server.mjs"

echo "==> cursor-browser-bridge install"
echo "    root: $ROOT"

chmod +x "$CLI" "$MCP" "$ROOT/scripts/install.sh" 2>/dev/null || true

# Symlink CLI into ~/.local/bin if present
BIN_DIR="${HOME}/.local/bin"
mkdir -p "$BIN_DIR"
ln -sfn "$CLI" "$BIN_DIR/cursor-browser"
echo "    CLI:  $BIN_DIR/cursor-browser"

# Install as Cursor extension (dev / unpacked)
if command -v cursor >/dev/null 2>&1; then
  # Prefer packing if vsce available, else use --install-extension on folder via symlink into extensions
  EXT_TARGET="${HOME}/.cursor/extensions/local.cursor-browser-bridge-0.1.0"
  rm -rf "$EXT_TARGET"
  mkdir -p "$EXT_TARGET"
  # Copy extension files (no node_modules needed)
  cp "$EXT_DIR/package.json" "$EXT_TARGET/"
  cp "$EXT_DIR/extension.js" "$EXT_TARGET/"
  # Cursor/VS Code expects package.json name matching folder conventions
  echo "    extension installed to: $EXT_TARGET"
  echo "    Reload Cursor window to activate (Cmd+Shift+P → Developer: Reload Window)"
else
  echo "    warning: 'cursor' CLI not found; copy extension manually to ~/.cursor/extensions/"
fi

# Grok MCP registration (optional)
if command -v grok >/dev/null 2>&1; then
  if grok mcp list 2>/dev/null | grep -qi 'cursor-browser'; then
    echo "    Grok MCP: cursor-browser already configured"
  else
    echo "    Adding Grok MCP server 'cursor-browser'..."
    grok mcp add cursor-browser -- node "$MCP" || {
      echo "    Could not auto-add MCP. Add manually to ~/.grok/config.toml:"
      cat <<EOF

[mcp_servers.cursor-browser]
command = "node"
args = ["$MCP"]
enabled = true
EOF
    }
  fi
else
  echo "    grok CLI not found; skip MCP registration"
  echo "    Manual ~/.grok/config.toml entry:"
  cat <<EOF

[mcp_servers.cursor-browser]
command = "node"
args = ["$MCP"]
enabled = true
EOF
fi

# User-level Grok skill
SKILL_DIR="${HOME}/.grok/skills/cursor-browser"
mkdir -p "$SKILL_DIR"
cp "$ROOT/skill/SKILL.md" "$SKILL_DIR/SKILL.md"
echo "    Grok skill: $SKILL_DIR/SKILL.md"

echo ""
echo "Done. Next:"
echo "  1. Reload Cursor (Developer: Reload Window)"
echo "  2. Open Browser Tab (View → Appearance → Open Browser)"
echo "  3. cursor-browser status"
echo "  4. cursor-browser open http://localhost:3000"
