---
name: cursor-browser
description: >
  Drive Cursor's built-in Browser Tab via cursor-browser-bridge (not chrome-cdp,
  not Peekaboo). Works for Grok Build in Cursor terminal. Navigate, click, type,
  screenshot, inspect DOM/console/network. Triggers: Cursor browser, Browser Tab,
  /cursor-browser, under the hood, DevTools.
---

# Cursor Browser Bridge

## Scope

Control **Cursor’s Browser Tab** in the correct project window.  
Do **not** use chrome-cdp or Peekaboo for this.

Repo: `~/Developer/cursor-browser-bridge` (or install path).

## Always route the window

```bash
cursor-browser windows
cursor-browser --workspace <project-folder-name> whoami
```

Or `cd` into the project first.

## Preferred single-tab flow

```bash
cursor-browser --workspace <name> close
cursor-browser --workspace <name> nav https://example.com
# prefer nav over open when a tab already exists
```

## Interaction

```bash
cursor-browser --workspace <name> click 'css-selector'
cursor-browser --workspace <name> type 'css-selector' 'text'
cursor-browser --workspace <name> press Enter
cursor-browser --workspace <name> snap /tmp/page.png
```

## Under the hood

```bash
cursor-browser --workspace <name> inspect    # meta, links, inputs, text
cursor-browser --workspace <name> a11y       # interactive tree
cursor-browser --workspace <name> console    # console logs
cursor-browser --workspace <name> network    # network requests
cursor-browser --workspace <name> eval '...' # any page JS
```

## MCP tools

If `cursor-browser` MCP is connected: `browser_navigate`, `browser_click`,
`browser_type`, `browser_screenshot`, `browser_inspect`, `browser_console`,
`browser_network`, `browser_evaluate`, … with optional `workspace`.

## Failure tips

| Issue | Action |
|-------|--------|
| Connection refused | Reload Cursor window; re-run install.sh |
| Wrong project | `--workspace` or cwd into project |
| Extra tabs | `close` then `nav` |
| CDP Input blocked | use click/type/press (DOM) |
