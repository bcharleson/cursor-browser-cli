# cursor-browser-bridge

**Drive Cursor IDE’s built-in Browser Tab from any terminal agent** — Grok Build, Claude Code, Codex, OpenCode, or plain shell — without leaving Cursor and without opening external Chrome.

Stay in your long chat in the integrated terminal. The agent navigates, clicks, types, screenshots, and inspects the **same** Browser Tab you already see in the IDE.

```
Grok / Claude Code / Codex / shell
        │  MCP stdio  or  CLI
        ▼
  mcp/server.mjs  ·  cli/cursor-browser
        │  HTTP 127.0.0.1:<port>
        ▼
  Cursor extension (this repo)
        │  cursor.browserView.*
        ▼
  Cursor Browser Tab  (per project window)
```

---

## Why this exists

Cursor’s Browser Automation (`cursor-ide-browser`) is wired to **Cursor Agent** only.

If you prefer **Claude Code**, **Grok Build**, **Codex**, or scripts in Cursor’s terminal, you previously could not control that tab. This bridge exposes the same internal `cursor.browserView.*` commands over **localhost HTTP + MCP + CLI**.

| You want | Use |
|----------|-----|
| Stay in Cursor + terminal agent | **This project** |
| Cursor’s own Agent browser tools | Built-in (no bridge) |
| Real Chrome profile / extensions | [Browser MCP](https://browsermcp.io/), [browser-bridge (Chrome)](https://github.com/koltyakov/browser-bridge) |
| Headless CI browser | Playwright MCP |

> Prior art: [VectorlyApp/cursor-browser-bridge](https://github.com/VectorlyApp/cursor-browser-bridge) pioneered the same architecture. This repo is an independent implementation with multi-window routing, Grok skill, single-tab defaults, and under-the-hood inspect tools.

---

## Features

### Navigation & tabs
- Open / navigate / back / forward / reload  
- **Single-tab by default** (`open` reuses a tab; `close` drops extras)  
- Multi-window routing (`--workspace af-exec-travel` or match `cwd`)

### Interaction
- **Click** (CSS selector)  
- **Type / fill** inputs  
- **Press** keys (Enter submits forms via DOM — CDP `Input.*` is blocked by Electron)  
- **Evaluate** arbitrary page JavaScript  

### Visual
- **Screenshots** (PNG via `cursor.browserView.takeScreenshot`)

### Under the hood (DevTools-like, no separate Chrome)
- **`inspect` / `dom`** — meta tags, element counts, headings, links, inputs, body text sample  
- **`a11y` / `snapshot`** — lightweight accessibility / interactive tree  
- **`console` / `logs`** — browser console messages (`getConsoleLogs`)  
- **`network`** — request log (`getNetworkRequests`)  
- **`eval`** — full page JS (read `localStorage`, React roots, computed styles, etc.)  
- **`cdp`** — raw Chrome DevTools Protocol when Cursor allows the method  

Screenshots **do work**. Console/network depend on Cursor’s internal APIs returning data for the active view (tested paths included in CLI).

---

## Requirements

- **Cursor IDE** (not stock VS Code alone — uses `cursor.browserView.*`)  
- **Node.js 18+**  
- Browser Automation available in Cursor (Settings → Tools & MCP → Browser Automation is fine to leave on)  
- Optional: Claude Code / Grok Build / Codex for MCP clients  

---

## Install

```bash
git clone https://github.com/brandoncharleson/cursor-browser-bridge.git
cd cursor-browser-bridge
./scripts/install.sh
```

Then in **each Cursor window** you care about:

1. **Developer: Reload Window** (`Cmd+Shift+P` / `Ctrl+Shift+P`)  
2. Confirm status bar: e.g. `af-exec-travel :17375`  
3. Open browser once if needed: **View → Appearance → Open Browser**

Verify:

```bash
cursor-browser windows
cursor-browser --workspace <your-folder-name> status
cursor-browser --workspace <your-folder-name> open https://example.com
cursor-browser --workspace <your-folder-name> snap /tmp/demo.png
```

### Manual pieces

| Piece | Location |
|-------|----------|
| Extension | `~/.cursor/extensions/local.cursor-browser-bridge-0.3.0/` |
| CLI | `~/.local/bin/cursor-browser` → `cli/cursor-browser` |
| MCP server | `node mcp/server.mjs` |
| Runtime state | `~/.cursor-browser-bridge/instances.json`, `port`, `bridge.log` |

---

## Multi-window routing

Each Cursor **project window** runs its own bridge on a free port and registers the workspace path/name.

```bash
cursor-browser windows
# :17375  af-exec-travel
# :17373  some-other-repo

# Pin the project (recommended)
cursor-browser --workspace af-exec-travel open http://localhost:3000

# Or run from inside the project
cd ~/Developer/af-exec-travel && cursor-browser open http://localhost:3000
```

Priority:

1. `--port` / `CURSOR_BROWSER_BRIDGE_PORT`  
2. `--workspace` / `CURSOR_BROWSER_WORKSPACE`  
3. Match `process.cwd()` to a registered workspace  
4. Process-name discovery if `instances.json` is empty  
5. Single open instance  

---

## CLI reference

```bash
cursor-browser [--workspace NAME|PATH] [--port N] <command>

windows | list          List bridge instances
status | whoami         Health / routing target
probe                   Which cursor.browserView.* commands exist

open <url>              Reuse one tab (close extras) + navigate
nav|navigate <url>      Navigate active tab only
tabs | close            List / keep a single tab
url | title

click <selector>
type <selector> <text>
press Enter|Tab|Escape

snap [path.png]         Screenshot
eval '<js>'             Page JS
inspect | dom           Under-the-hood structure
a11y | snapshot         Accessibility-ish tree
console | logs          Console messages
network                 Network requests

back | forward | reload
select <viewId>
cdp <Method> [json]
```

### Examples

```bash
# Single-tab Google smoke
cursor-browser --workspace af-exec-travel close
cursor-browser --workspace af-exec-travel nav https://www.google.com
cursor-browser --workspace af-exec-travel click 'textarea[name=q]'
cursor-browser --workspace af-exec-travel type 'textarea[name=q]' 'hello'
cursor-browser --workspace af-exec-travel press Enter
cursor-browser --workspace af-exec-travel snap /tmp/results.png

# Under the hood
cursor-browser --workspace af-exec-travel inspect
cursor-browser --workspace af-exec-travel console
cursor-browser --workspace af-exec-travel network
cursor-browser --workspace af-exec-travel a11y
cursor-browser --workspace af-exec-travel eval 'performance.timing.toJSON?.() || performance.now()'
cursor-browser --workspace af-exec-travel eval 'JSON.stringify({...localStorage})'
```

---

## MCP (Claude Code, Codex, Grok Build, …)

The server speaks **MCP over stdio** (no npm install beyond Node).

### Grok Build

```bash
grok mcp add cursor-browser -- node /absolute/path/to/cursor-browser-bridge/mcp/server.mjs
# or use ./scripts/install.sh
```

User skill (auto-installed): `~/.grok/skills/cursor-browser/SKILL.md`

### Claude Code

```bash
claude mcp add cursor-browser -- node /absolute/path/to/cursor-browser-bridge/mcp/server.mjs
```

Or in `~/.claude.json` / project MCP config:

```json
{
  "mcpServers": {
    "cursor-browser": {
      "command": "node",
      "args": ["/absolute/path/to/cursor-browser-bridge/mcp/server.mjs"]
    }
  }
}
```

### Codex / other MCP clients

Point any stdio MCP client at:

```text
command: node
args:    ["/absolute/path/to/cursor-browser-bridge/mcp/server.mjs"]
```

Optional env:

| Env | Purpose |
|-----|---------|
| `CURSOR_BROWSER_WORKSPACE` | Default project name/path when tools omit `workspace` |
| `CURSOR_BROWSER_BRIDGE_PORT` | Force a port |

### MCP tools

| Tool | Purpose |
|------|---------|
| `browser_windows` | List Cursor windows + ports |
| `browser_status` / `browser_probe` | Health / command probe |
| `browser_open` / `browser_navigate` | Open or navigate |
| `browser_tabs` / `browser_select` | Tabs |
| `browser_url` / `browser_title` | Read location |
| `browser_click` / `browser_type` / `browser_press` | Interact |
| `browser_screenshot` | PNG screenshot |
| `browser_inspect` | DOM / meta / structure |
| `browser_snapshot` | A11y-ish tree |
| `browser_console` | Console logs |
| `browser_network` | Network log |
| `browser_evaluate` | Page JS |
| `browser_cdp` | Raw CDP (when allowed) |
| `browser_back` / `browser_forward` / `browser_reload` | History |

All tools accept optional `workspace` (folder name or path).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Cursor window: af-exec-travel                              │
│  ┌──────────────────┐    ┌───────────────────────────────┐  │
│  │ Extension host   │───▶│ Browser Tab (BrowserView)     │  │
│  │ HTTP :17375      │    │ cursor.browserView.*          │  │
│  └────────▲─────────┘    └───────────────────────────────┘  │
└───────────┼─────────────────────────────────────────────────┘
            │ loopback HTTP
   ┌────────┴────────┐
   │ CLI / MCP proxy │  ← Grok · Claude Code · Codex · scripts
   └─────────────────┘
```

- Extension starts on activate (`onStartupFinished`), binds `127.0.0.1` only.  
- Registers workspace → port in `~/.cursor-browser-bridge/instances.json`.  
- CLI/MCP resolve the correct window so you do not drive another project’s browser.

---

## Security

- Listens on **loopback only** (`127.0.0.1`).  
- Can navigate any origin the Browser Tab can reach and run page JS.  
- Do **not** expose the port over the network.  
- Treat the bridge like a local debugger: same trust boundary as your IDE.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Connection refused | Reload Cursor window; run `./scripts/install.sh` |
| Wrong project browser | `cursor-browser windows` then `--workspace <name>` |
| Multiple tabs | `cursor-browser close` then prefer `nav` over stacking `open` |
| `press Enter` / CDP Input fails | Expected — Electron blocks CDP `Input.*`; use DOM `press` / `click` / `type` |
| Empty console/network | Interact with the page first; APIs may return `[]` until activity |
| Extension not loading | Check Output → extension host; confirm folder under `~/.cursor/extensions/` |

---

## Repo layout

```
cursor-browser-bridge/
├── README.md
├── LICENSE                 # MIT
├── package.json
├── extension/              # Cursor/VS Code extension (HTTP bridge)
│   ├── package.json
│   └── extension.js
├── cli/cursor-browser      # Node CLI
├── mcp/server.mjs          # MCP stdio server
├── scripts/install.sh
└── skill/SKILL.md          # Grok Build skill template
```

No runtime npm dependencies (Node built-ins only).

---

## Development

```bash
# After editing extension/extension.js
./scripts/install.sh
# Reload the Cursor window (or restart the project’s extension host)

# Smoke
cursor-browser --workspace <project> status
cursor-browser --workspace <project> nav https://example.com
cursor-browser --workspace <project> inspect
cursor-browser --workspace <project> snap /tmp/out.png
```

Internal APIs (`cursor.browserView.*`) are **undocumented** and can change with Cursor updates. `probe` lists what exists on your build.

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Acknowledgments

- Cursor team for the embedded Browser Tab and `browserView` commands  
- [VectorlyApp/cursor-browser-bridge](https://github.com/VectorlyApp/cursor-browser-bridge) for establishing the extension ↔ MCP bridge pattern  
