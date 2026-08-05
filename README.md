# cursor-browser-bridge

Drive **Cursor’s built-in Browser Tab** from **Grok Build** (or any CLI/MCP client).

## Why this exists

Cursor’s Browser Automation (`cursor-ide-browser` / `browser_*` tools) is wired only into
**Cursor Agent**. Grok Build runs as a separate process in the terminal and cannot call those
tools. This bridge:

1. Runs as a **Cursor extension** inside the IDE
2. Calls Cursor’s internal `cursor.browserView.*` commands
3. Exposes them over **localhost HTTP** + **MCP stdio** + a **CLI**

So Grok can open/navigate/screenshot the same Browser Tab you see in Cursor.

## Architecture

```
Grok Build ──MCP/CLI──► cursor-browser-bridge (stdio)
                              │
                              ▼ HTTP 127.0.0.1:17373
                    Cursor extension (this package)
                              │
                              ▼ vscode.commands.executeCommand
                    cursor.browserView.navigate / takeScreenshot / …
                              │
                              ▼
                    Cursor Browser Tab (BrowserView)
```

## Install

```bash
cd ~/Developer/cursor-browser-bridge
./scripts/install.sh
```

Then **reload Cursor** (Command Palette → “Developer: Reload Window”).

You should see a status-bar item: `Cursor Browser Bridge :17373`.

## Wire into Grok

```bash
# MCP (recommended)
grok mcp add cursor-browser -- node /Users/brandoncharleson/Developer/cursor-browser-bridge/mcp/server.mjs

# or CLI-only (skill uses this)
export PATH="$HOME/Developer/cursor-browser-bridge/cli:$PATH"
cursor-browser status
cursor-browser open http://localhost:3000
cursor-browser snap
```

## CLI

```bash
cursor-browser status              # bridge health + open tabs
cursor-browser open <url>          # open/focus browser and navigate
cursor-browser nav <url>           # navigate active tab
cursor-browser tabs                # list tabs
cursor-browser url                 # current URL
cursor-browser title               # current title
cursor-browser snap [path.png]     # screenshot viewport
cursor-browser eval 'document.title'
cursor-browser back | forward | reload
cursor-browser cdp <Method> [json] # raw CDP (Page.reload, etc.)
```

## MCP tools

| Tool | Purpose |
|------|---------|
| `browser_status` | Health + port + tabs |
| `browser_open` | Open Browser Tab + navigate |
| `browser_navigate` | Navigate active (or given) tab |
| `browser_tabs` | List tabs |
| `browser_snapshot` | Screenshot → path |
| `browser_evaluate` | Run JS in page |
| `browser_url` / `browser_title` | Read current page |
| `browser_back` / `browser_forward` / `browser_reload` | History |
| `browser_cdp` | Send raw CDP command |

## Notes / limits

- Cursor must be open with this extension activated.
- Commands use **undocumented** Cursor internals (`cursor.browserView.*`). They can break on Cursor upgrades; the extension probes and reports failures clearly.
- Default bind: `127.0.0.1:17373` only (loopback). Override with setting `cursorBrowserBridge.port`.
- This is **not** chrome-cdp and **not** Peekaboo — it targets the Cursor Browser Tab you already have open.

## Security

Local loopback only. Do not expose the port. The bridge can navigate any origin the Browser Tab can reach and run arbitrary page JS via `evaluate` / CDP.
