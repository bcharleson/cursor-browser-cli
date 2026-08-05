---
name: cursor-browser
description: >
  Drive Cursor's built-in Browser Tab from Grok Build via cursor-browser-bridge
  (not chrome-cdp, not Peekaboo). Targets the same Cursor project window as the
  workspace. Use for "Cursor browser", "Browser Tab", open/navigate/screenshot
  in Cursor, /cursor-browser.
---

# Cursor Browser (per project window)

## Critical: multi-window routing

You may have several Cursor windows (Tripwire, other repos). Each runs its own
bridge. **Always target the correct project.**

```bash
# See which windows are bridged
cursor-browser windows

# Explicit (recommended when ambiguous)
cursor-browser --workspace af-exec-travel open http://localhost:3000

# Or: run CLI with cwd inside that project
cd ~/Developer/af-exec-travel && cursor-browser open http://localhost:3000
```

MCP tools accept optional `workspace` (e.g. `"af-exec-travel"`).

## Workflow

1. `cursor-browser windows` — pick the right project
2. `cursor-browser --workspace <name> whoami` — confirm routing
3. `cursor-browser --workspace <name> open <url>` — Browser Tab **in that window**
4. `url` / `title` / `eval` / `snap` as needed

## Do not use

- chrome-cdp (external Chrome)
- Peekaboo (macOS UI automation)

## Install / reload

Repo: `~/Developer/cursor-browser-bridge` (not inside product apps).

```bash
~/Developer/cursor-browser-bridge/scripts/install.sh
# Then: Developer: Reload Window in EACH Cursor window you care about
```

Status bar should show: `$(globe) af-exec-travel :1737x` in the Tripwire window.
