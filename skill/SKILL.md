---
name: cursor-browser
description: >
  Drive Cursor's built-in Browser Tab from Grok Build via cursor-browser-bridge
  (not chrome-cdp, not Peekaboo). Use when the user wants to open, navigate,
  click, screenshot, or inspect the Cursor Browser / Browser Tab / Simple Browser
  while working in the Cursor terminal with Grok. Triggers: "Cursor browser",
  "Browser Tab", "open in Cursor browser", "navigate the browser", /cursor-browser.
---

# Cursor Browser (via bridge)

## When to use

Use this for **Cursor’s own Browser Tab** (View → Appearance → Open Browser).

Do **not** use:
- `chrome-cdp` (external Chrome)
- Peekaboo (macOS UI automation)

## Prerequisites

1. Repo: `~/Developer/cursor-browser-bridge` (outside app projects)
2. Extension installed + Cursor reloaded
3. Status bar shows `Browser Bridge :17373` (or similar)
4. CLI on PATH: `cursor-browser` → `~/Developer/cursor-browser-bridge/cli/cursor-browser`
5. Optional MCP: `cursor-browser` server in Grok config

## Workflow

1. **Health check**
   ```bash
   cursor-browser status
   # or MCP: browser_status
   ```
   If unreachable: ask user to reload Cursor / run `~/Developer/cursor-browser-bridge/scripts/install.sh`.

2. **Open + navigate**
   ```bash
   cursor-browser open http://localhost:3000
   cursor-browser nav https://example.com
   ```

3. **Inspect**
   ```bash
   cursor-browser url
   cursor-browser title
   cursor-browser tabs
   cursor-browser eval 'document.body.innerText.slice(0,500)'
   cursor-browser snap /tmp/cursor-snap.png
   ```

4. **History**
   ```bash
   cursor-browser back
   cursor-browser forward
   cursor-browser reload
   ```

5. **Low-level CDP** (when needed)
   ```bash
   cursor-browser cdp Runtime.evaluate '{"expression":"location.href","returnByValue":true}'
   ```

## MCP tools (if server connected)

| Tool | Use |
|------|-----|
| `browser_status` | Connectivity |
| `browser_open` | Open tab + URL |
| `browser_navigate` | Go to URL |
| `browser_tabs` | List views |
| `browser_snapshot` | Screenshot |
| `browser_evaluate` | Run page JS |
| `browser_url` / `browser_title` | Read page |
| `browser_back` / `browser_forward` / `browser_reload` | History |
| `browser_cdp` | Raw CDP |

Prefer MCP `use_tool` when available; fall back to the `cursor-browser` CLI via shell.

## Failure modes

| Symptom | Fix |
|---------|-----|
| Connection refused | Extension not running — reload Cursor |
| Command not found / probe all false | Cursor build changed internals — re-probe, update extension |
| Screenshot empty | Tab not loaded — `open` URL first, wait, retry |
| Wrong window | Use `tabs` + `select` with `viewId` |

## Scope

This skill and the bridge live under **`~/Developer/cursor-browser-bridge`** and
**`~/.grok/skills/cursor-browser`**. Never nest them inside product repos (e.g. Tripwire).
