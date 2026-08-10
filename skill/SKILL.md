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

## Always pin the project first (required multi-window)

Each Cursor project has its own bridge on its own port. **Never open a tab until
you know which project/port you are targeting.**

```bash
# 1) What bridges are live? (project → port)
cursor-browser windows

# 2) What project is THIS cwd / workspace?
cursor-browser pin
# or:
cursor-browser --workspace <project-folder> pin

# 3) Pin for the rest of the shell session
eval $(cursor-browser pin --export)
# sets CURSOR_BROWSER_WORKSPACE + CURSOR_BROWSER_CLI_PORT
```

Or pass every time:

```bash
cursor-browser --workspace <project-folder> whoami
cursor-browser --workspace <project-folder> open http://localhost:3000
```

**Prefer `--workspace <name>` over raw port.** Ports can change after
`recover` / Restart Server; the project name stays stable.

Multi-project days: **always** pass `--workspace` (or pin via `eval $(… pin --export)`).

## Agent loop (preferred)

```bash
# 0) Discover + pin (once per session / project)
cursor-browser windows
cursor-browser pin
eval $(cursor-browser pin --export)
# confirm:
cursor-browser whoami

# 1) Single tab + navigate → ref snapshot printed as text
cursor-browser open http://localhost:3000
# or
cursor-browser nav http://localhost:3000

# 2) Read refs from snapshot output (e1, e5, …)

# 3) Interact by ref
cursor-browser click e5
cursor-browser fill e3 "value"
cursor-browser type e3 "more"
cursor-browser hover e2
cursor-browser press Enter
cursor-browser scroll --y 600
cursor-browser select-option e7 "option-value"

# Optional: fresh refs after same-page interact
cursor-browser fill e3 "x" --snap
# After a navigation click, prefer wait + snapshot (most reliable)
cursor-browser click e5 --wait-nav --timeout 15000
cursor-browser snapshot
# --snap on a nav click also works (CLI falls back if needed) but is slower

# 4) Wait for state (avoid races)
cursor-browser wait --url /dashboard --timeout 15000
cursor-browser wait --text "Welcome"
cursor-browser wait --ref e12

# 5) Lock while automating (optional)
cursor-browser lock
# ... actions ...
cursor-browser unlock
```

Snapshot output ends with a bridge footer when routing is known:

```text
# bridge: my-app :17375 (cwd)
```

If that project is wrong, re-run `pin` / pass `--workspace`.

## Visual + under the hood

```bash
cursor-browser screenshot /tmp/page.png
cursor-browser inspect      # meta, links, inputs, body
cursor-browser console
cursor-browser network
cursor-browser eval 'document.title'
cursor-browser snapshot     # refresh refs after DOM change
cursor-browser --json open http://localhost:3000  # raw JSON
```

## MCP tools (if connected)

**Always start multi-project sessions with resolve:**

1. `browser_windows` — list project → port  
2. `browser_resolve` / `browser_pin` — pin current project (pass `workspace` if needed)  
3. Every later tool: pass the same `workspace`

Tools: `browser_open`, `browser_navigate`, `browser_snapshot`, `browser_click`,
`browser_dblclick`, `browser_rightclick`, `browser_type`, `browser_fill`,
`browser_scroll`, `browser_select_option`, `browser_hover`, `browser_press`,
`browser_wait`, `browser_lock`, `browser_unlock`, `browser_screenshot`,
`browser_inspect`, `browser_console`, `browser_network`, `browser_evaluate`, …
+ optional `workspace`, `snapshot`, `waitNavigation`.

MCP **fails closed** when multiple bridges are live and no workspace/cwd match —
it will not silently open another project’s Browser Tab.

## Rules of thumb

1. **Pin first** — `windows` → `pin` → env or `--workspace`.  
2. **Snapshot before click** — refs go stale after navigation/DOM updates.  
3. Prefer **ref** over CSS when the snapshot provides one.  
4. Prefer **`open` / `nav`** (they return snapshot text) over bare navigate.  
5. Use **`wait`** or **`--wait-nav`** after clicks that change the page.  
6. Use **`--snap`** when you need fresh refs in the same step as an action.  
7. **`close`** if extra tabs appear; keep one tab for reliability.  
8. Multi-project: always pass **`--workspace`** (or pinned env).  
9. `fill` = clear + set; `type` = append.

## Failure tips

| Issue | Fix |
|-------|-----|
| Connection refused / empty `windows` | **`cursor-browser doctor`** then **`cursor-browser recover`**. If still down: Cmd+Shift+P → **Cursor Browser CLI: Restart Server** (extension must be Enabled). Browser Tab open ≠ bridge up. |
| After reboot bridge dead | Extension did not re-activate HTTP server. `recover` clears stale port; Restart Server in the **project** Cursor window. |
| Wrong project | `windows` → `pin` → `--workspace` or `eval $(cursor-browser pin --export)` |
| Multiple windows error | Pass `--workspace <name>` or pin; CLI/MCP will not guess |
| Element not found | New `snapshot`, use fresh ref |
| Race / empty page | `wait --url` / `--text` / `--ref` or `--wait-nav` |
| Noisy JSON needed | Pass `--json` |

### Recovery commands

```bash
cursor-browser doctor          # diagnose ports / extension / stale state
cursor-browser recover         # clear stale state + try restart + wait for bridge
cursor-browser windows         # must list project with live port
cursor-browser pin             # re-discover this project → port after recover
```
