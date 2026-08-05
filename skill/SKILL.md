---
name: cursor-browser
description: >
  Drive Cursor IDE Browser Tab via cursor-browser-cli. Navigate, ref snapshots,
  click/type/fill by ref, wait-for, lock, screenshot, console/network/inspect.
  For Grok Build, Claude Code, Codex in Cursor terminal. Triggers: Cursor browser,
  Browser Tab, /cursor-browser, snapshot, under the hood.
---

# cursor-browser-cli

Control **Cursor’s Browser Tab** in the matching project window.  
Not chrome-cdp. Not Peekaboo. Not a separate Chromium.

Install path: `~/Developer/cursor-browser-cli` (or your clone).

## Always route the window

```bash
cursor-browser windows
cursor-browser --workspace <project-folder> whoami
```

Or `cd` into the project first.

## Agent loop (preferred)

```bash
# 1) Single tab + navigate → ref snapshot printed
cursor-browser --workspace <name> open http://localhost:3000
# or
cursor-browser --workspace <name> nav http://localhost:3000

# 2) Read refs from snapshot output (e1, e5, …)

# 3) Interact by ref
cursor-browser --workspace <name> click e5
cursor-browser --workspace <name> fill e3 "value"
cursor-browser --workspace <name> type e3 "more"
cursor-browser --workspace <name> hover e2
cursor-browser --workspace <name> press Enter

# 4) Wait for state (avoid races)
cursor-browser --workspace <name> wait --url /dashboard --timeout 15000
cursor-browser --workspace <name> wait --text "Welcome"
cursor-browser --workspace <name> wait --ref e12
cursor-browser --workspace <name> wait --selector "button.save"

# 5) Lock while automating (optional)
cursor-browser --workspace <name> lock
# ... actions ...
cursor-browser --workspace <name> unlock
```

## Visual + under the hood

```bash
cursor-browser --workspace <name> screenshot /tmp/page.png
cursor-browser --workspace <name> inspect      # meta, links, inputs, body
cursor-browser --workspace <name> console
cursor-browser --workspace <name> network
cursor-browser --workspace <name> eval 'document.title'
cursor-browser --workspace <name> snapshot     # refresh refs after DOM change
```

## MCP tools (if connected)

`browser_open`, `browser_navigate`, `browser_snapshot`, `browser_click`,
`browser_type`, `browser_fill`, `browser_hover`, `browser_press`, `browser_wait`,
`browser_lock`, `browser_unlock`, `browser_screenshot`, `browser_inspect`,
`browser_console`, `browser_network`, `browser_evaluate`, … + optional `workspace`.

## Rules of thumb

1. **Snapshot before click** — refs go stale after navigation/DOM updates.  
2. Prefer **ref** over CSS when both work.  
3. Prefer **`nav` / `open`** which return snapshots over bare navigate.  
4. Use **`wait`** after clicks that change the page.  
5. **`close`** if extra tabs appear; keep one tab for reliability.  
6. Multi-project: always pass **`--workspace`**.

## Failure tips

| Issue | Fix |
|-------|-----|
| Connection refused | `./scripts/install.sh` + Reload Window |
| Wrong project | `windows` then `--workspace` |
| Element not found | New `snapshot`, use fresh ref |
| Race / empty page | `wait --url` / `--text` / `--ref` |
