---
name: cursor-browser
description: >
  Drive Cursor IDE's built-in Browser Tab via cursor-browser-cli. Navigate,
  ref snapshots, click/type/fill/scroll/select-option by ref, wait-for, lock,
  screenshot, console/network/inspect. For Grok Build, Claude Code, Codex in
  Cursor terminal. Triggers: Cursor browser, Browser Tab, /cursor-browser,
  snapshot, under the hood, localhost UI check in Cursor.
---

# cursor-browser-cli

Control **Cursor’s Browser Tab** in the matching project window.

This skill is **only** for the in-IDE Browser Tab. It does not drive an external
desktop browser product. Other browser tools (if installed on the machine) are
separate and independent — use those when you need a full browser profile,
existing cookie sessions, or non-Cursor windows. Prefer this tool for day-to-day
app UI work inside Cursor (local servers, fast ref loops, same tab as the IDE).

Install path: `~/Developer/cursor-browser-cli` (or your clone / global npm).

## Always route the window

```bash
cursor-browser windows
cursor-browser --workspace <project-folder> whoami
```

Or `cd` into the project first so cwd routing works.

Multi-project days: **always** pass `--workspace`.

## Agent loop (preferred)

```bash
# 1) Single tab + navigate → ref snapshot printed as text
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
cursor-browser --workspace <name> scroll --y 600
cursor-browser --workspace <name> select-option e7 "option-value"

# Optional: fresh refs after same-page interact
cursor-browser --workspace <name> fill e3 "x" --snap
# After a navigation click, prefer wait + snapshot (most reliable)
cursor-browser --workspace <name> click e5 --wait-nav --timeout 15000
cursor-browser --workspace <name> snapshot
# --snap on a nav click also works (CLI falls back if needed) but is slower

# 4) Wait for state (avoid races)
cursor-browser --workspace <name> wait --url /dashboard --timeout 15000
cursor-browser --workspace <name> wait --text "Welcome"
cursor-browser --workspace <name> wait --ref e12

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
cursor-browser --workspace <name> --json open http://localhost:3000  # raw JSON
```

## MCP tools (if connected)

`browser_open`, `browser_navigate`, `browser_snapshot`, `browser_click`,
`browser_dblclick`, `browser_rightclick`, `browser_type`, `browser_fill`,
`browser_scroll`, `browser_select_option`, `browser_hover`, `browser_press`,
`browser_wait`, `browser_lock`, `browser_unlock`, `browser_screenshot`,
`browser_inspect`, `browser_console`, `browser_network`, `browser_evaluate`, …
+ optional `workspace`, `snapshot`, `waitNavigation`.

## Rules of thumb

1. **Snapshot before click** — refs go stale after navigation/DOM updates.  
2. Prefer **ref** over CSS when the snapshot provides one.  
3. Prefer **`open` / `nav`** (they return snapshot text) over bare navigate.  
4. Use **`wait`** or **`--wait-nav`** after clicks that change the page.  
5. Use **`--snap`** when you need fresh refs in the same step as an action.  
6. **`close`** if extra tabs appear; keep one tab for reliability.  
7. Multi-project: always pass **`--workspace`**.  
8. `fill` = clear + set; `type` = append.

## Failure tips

| Issue | Fix |
|-------|-----|
| Connection refused / empty `windows` | **`cursor-browser doctor`** then **`cursor-browser recover`**. If still down: Cmd+Shift+P → **Cursor Browser CLI: Restart Server** (extension must be Enabled). Browser Tab open ≠ bridge up. |
| After reboot bridge dead | Extension did not re-activate HTTP server. `recover` clears stale port; Restart Server in the **project** Cursor window. |
| Wrong project | `windows` then `--workspace` |
| Element not found | New `snapshot`, use fresh ref |
| Race / empty page | `wait --url` / `--text` / `--ref` or `--wait-nav` |
| Noisy JSON needed | Pass `--json` |

### Recovery commands

```bash
cursor-browser doctor          # diagnose ports / extension / stale state
cursor-browser recover         # clear stale state + try restart + wait for bridge
cursor-browser windows         # must list project with live port
```
