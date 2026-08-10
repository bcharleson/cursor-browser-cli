# cursor-browser-cli

**Drive Cursor IDE’s built-in Browser Tab from any CLI agent or shell** — Grok Build, Claude Code, Codex, OpenCode, or plain terminal — without leaving Cursor and without spinning up a separate Chrome/Playwright stack.

Stay in a long chat in Cursor’s integrated terminal. Navigate, take **accessibility snapshots with refs**, click/type/fill by **ref**, wait for page state, lock the tab, screenshot, and inspect console/network/DOM — all on the **same** Browser Tab you already see in the IDE.

```
Grok Build · Claude Code · Codex · OpenCode · shell
              │
              │  CLI  (cursor-browser)
              │  or MCP stdio  (mcp/server.mjs)
              ▼
     localhost HTTP  127.0.0.1:<port>
              │
              ▼
   Cursor extension (workspace host)
              │  cursor.browserView.*
              ▼
     Cursor Browser Tab  (this project window)
```

---

## Why this exists

### The problem

Cursor ships **Browser Automation** for its own **Cursor Agent** (chat/composer with built-in browser tools). That is great when you stay inside Cursor Agent.

Many people do **not** stay there. A common workflow is:

1. Open a project in Cursor  
2. Run **Grok Build**, **Claude Code**, **Codex**, or another CLI agent **in the integrated terminal**  
3. Still want to use the **in-IDE Browser Tab** for UI checks, local apps, auth flows, visual verification, etc.

Those CLI agents **cannot** call Cursor Agent’s built-in browser tools. Without something else, you end up:

- Opening extra Chrome windows and tabs  
- Re-explaining context across tools  
- Running a separate Playwright/CDP stack just to “see” the app  
- Or bouncing back into Cursor Agent only for browser steps  

That breaks the flow: you wanted one IDE window, one Browser Tab, and multiple agents that can share it.

### The solution

**cursor-browser-cli** is a small local stack that lets **any** agent (or script) control Cursor’s Browser Tab the same way Cursor Agent does — via:

| Surface | Best for |
|---------|----------|
| **`cursor-browser` CLI** | Fast, scriptable loops; agents that shell out; one-off commands |
| **MCP server** (`mcp/server.mjs`) | Claude Code, Codex, Grok, and any stdio MCP client with native tool calling |
| **Agent skill** (`skill/SKILL.md`) | Teaches agents the snapshot → ref → wait loop and multi-window routing |

You keep working in the CLI agent. The Browser Tab stays inside Cursor. No second browser product required for day-to-day agent work.

### What this is *not*

| Need | Use instead |
|------|-------------|
| Cursor’s own Agent chat/composer | Built-in browser tools (no extra install) |
| External desktop browser / cookie sessions / full profile | A separate external-browser tool of your choice |
| Headless CI / pure automation outside Cursor | Playwright, Puppeteer, or a headless browser MCP |
| Native macOS UI outside the Browser Tab | Other OS automation tools |

This project targets one job: **multi-agent access to Cursor’s Browser Tab from CLI/MCP while you work inside Cursor.** It is intentionally independent of any external-browser stack so both can coexist without coupling.

---


## Bridge recovery (agents / post-reboot)

The CLI talks to a **localhost HTTP bridge** started by the Cursor extension. The in-IDE Browser Tab can work while that bridge is down.

```bash
cursor-browser doctor     # ports, extension install, stale state
cursor-browser recover    # clear stale state + request restart/reload + wait
cursor-browser windows    # must list live project ports
```

`recover` is safe to run from Grok/Claude/Codex when you see `ECONNREFUSED`. It:

1. Prunes dead `instances.json` / port files  
2. Writes `~/.cursor-browser-cli/request-restart` (extension polls this)  
3. Best-effort UI automation (optional `peekaboo` / AppleScript) to **Restart Server** or **Reload Window**  
4. Waits until a bridge port answers  

Optional env: `CURSOR_BROWSER_NO_AUTO_RECOVER=1` disables auto-recover on connection errors.

## Features

### Multi-agent by design

- Same Browser Tab for **Grok Build**, **Claude Code**, **Codex**, **OpenCode**, shell scripts, and humans  
- **CLI** and **MCP** share the same extension HTTP API  
- **Workspace routing** so multiple Cursor windows do not step on each other  
- Optional **skill** files for Grok / Claude / agents that load `SKILL.md`

### Agent-grade interaction (ref model)

- **Accessibility snapshot with refs** (`e1`, `e5`, …) — YAML-style tree agents can read and act on  
- **Click / double-click / right-click / type / fill / hover by ref** (CSS selector fallback)  
- **`scroll`** window or element; **`select-option`** for `<select>`  
- **`wait`** for URL substring, visible text, ref, or CSS selector (reduces agent races)  
- **`--wait-nav`** after click to wait for URL change; **`--snap`** to attach a fresh snapshot after interact  
- **Lock / unlock** the tab during automation so accidental human input does not fight the agent  
- **Resize** viewport  
- **`open` / `nav`** print **snapshot text by default** (use `--json` for full payload)  

### Fast, CLI-first

- Single binary-style script on your `PATH`: `cursor-browser`  
- Low overhead: Node built-ins only, loopback HTTP, no runtime npm deps  
- Multi-window: `--workspace <folder>` or match `cwd`  
- **Single-tab policy**: reuse one tab; `close` extras for predictable automation  

### Under the hood (debug like DevTools)

- **Screenshot** (PNG path; MCP can return image content when available)  
- **inspect** — meta, counts, headings, links, inputs, body text  
- **console** / **network** via Cursor `getConsoleLogs` / `getNetworkRequests`  
- **eval** — run page JavaScript  

### Local and contained

- Listens on **127.0.0.1 only**  
- Per-window port (default base **17373**, auto-increments if busy)  
- State under `~/.cursor-browser-cli/`  
- Status bar shows `project :port` so you know which window is listening  

---

## Requirements

- **Cursor IDE** with Browser Tab / `cursor.browserView.*` APIs available  
- **Node.js ≥ 18** (CLI + MCP; no production npm dependencies)  
- macOS / Linux / Windows (where Cursor runs)

---

## Install (recommended: npm)

```bash
npm install -g cursor-browser-cli
```

That installs:

| Piece | What you get |
|-------|----------------|
| **CLI** | `cursor-browser` on your PATH |
| **MCP** | `cursor-browser-mcp` on your PATH |
| **Extension** | Copied into `~/.cursor/extensions/` (via `postinstall`) |
| **Skills** | Agent skill templates when those skill roots exist |

If the extension step was skipped (e.g. `npm i --ignore-scripts`), run:

```bash
cursor-browser setup
```

Then **reload each Cursor window** you use:

`Cmd+Shift+P` (or `Ctrl+Shift+P`) → **Developer: Reload Window**

Confirm the status bar shows something like `your-project :17375`, then:

```bash
cursor-browser windows
cursor-browser --workspace <project-folder> open https://example.com
cursor-browser --workspace <project-folder> snapshot
```

### Skip automatic setup

```bash
CURSOR_BROWSER_SKIP_SETUP=1 npm install -g cursor-browser-cli
cursor-browser setup   # when ready
```

### From source (optional)

```bash
git clone https://github.com/bcharleson/cursor-browser-cli.git
cd cursor-browser-cli
npm install          # runs setup
# or: ./scripts/install.sh
```

### Extension commands (inside Cursor)

| Command palette | Purpose |
|-----------------|---------|
| **Cursor Browser CLI: Show Status** | Health + workspace/port |
| **Cursor Browser CLI: Restart Server** | Restart the localhost HTTP server |

### Settings

| Setting | Default | Meaning |
|---------|---------|---------|
| `cursorBrowserCli.port` | `17373` | Preferred port (falls through if busy) |
| `cursorBrowserCli.enabled` | `true` | Start the HTTP server on activation |

---

## Quick start (agent loop)

This is the loop CLI agents should follow:

```bash
# 0) Discover this project → bridge port (required with multiple Cursor windows)
cursor-browser windows          # list: project → port
cursor-browser pin              # this cwd's project + port + export lines
eval $(cursor-browser pin --export)
# sets CURSOR_BROWSER_WORKSPACE + CURSOR_BROWSER_CLI_PORT
# prefer workspace name over port (ports can change after recover)

# or pin explicitly:
export WS=my-app   # folder name of the Cursor workspace

# 1) One clean tab + navigate → snapshot with [ref=e…] printed
cursor-browser --workspace $WS close
cursor-browser --workspace $WS open http://localhost:3000

# 2) Interact by ref from the snapshot
cursor-browser --workspace $WS click e5
cursor-browser --workspace $WS fill e3 "hello"
cursor-browser --workspace $WS press Enter

# 3) Wait for navigation / UI (avoid races)
cursor-browser --workspace $WS wait --url /results --timeout 15000
cursor-browser --workspace $WS wait --text "Success"

# 4) Visual / debug
cursor-browser --workspace $WS screenshot /tmp/out.png
cursor-browser --workspace $WS inspect
cursor-browser --workspace $WS console
```

**Rules of thumb**

1. **Pin first** — `windows` → `pin` → env or `--workspace` (never guess with multi-window).  
2. Take a **fresh `snapshot`** after navigation or large DOM changes before using refs.  
3. Prefer **ref** (`e12`) over CSS when the snapshot provides one.  
4. Prefer **`open` / `nav`** (they return snapshots) over bare navigate without a follow-up snap.  
5. Use **`wait`** after clicks that change URL or content.  
6. Use **`close`** if extra tabs pile up; keep one tab for reliability.  
7. With multiple Cursor windows, always pass **`--workspace`** (or pin via `eval $(cursor-browser pin --export)`).

---

## CLI reference

```text
cursor-browser [--workspace NAME|PATH] [--port N] <command> [args]
```

### Global flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--workspace <name\|path>` | `-w`, `--project` | Target Cursor window by workspace folder name or absolute path |
| `--port <n>` | `-p` | Force a specific bridge port (from `pin` / `windows`) |
| `--json` | | Print full JSON (large trees stripped) instead of snapshot text |
| `--export` | | With `pin` / `resolve`: print shell exports only (`eval $(cursor-browser pin --export)`) |
| `--snap` | `--snapshot` | After interact, attach a fresh ref snapshot |
| `--wait-nav` | `--wait-navigation` | After click, wait for URL change |
| `--help` | `-h` | Show usage |

### Environment variables

| Variable | Purpose |
|----------|---------|
| `CURSOR_BROWSER_WORKSPACE` | Default workspace when `--workspace` is omitted |
| `CURSOR_BROWSER_CLI_PORT` | Default port when `--port` is omitted |

Legacy env names from earlier package renames may still be read by clients for compatibility.

### Routing commands

| Command | Description |
|---------|-------------|
| `windows` | List live bridges (project → port) |
| `pin` / `resolve` | Discover this project + port; agent pin step (`--export` for shell) |
| `whoami` / `status` / `health` | Resolved target + health + pin exports |
| `probe` | Low-level reachability check |

### Tabs and navigation

| Command | Description |
|---------|-------------|
| `open <url>` | Single-tab open/reuse + navigate + **snapshot** |
| `nav <url>` / `navigate <url>` | Navigate active tab + **snapshot** |
| `tabs` | List Browser Tab view IDs |
| `close [viewId]` | Close extras / specific tab (single-tab hygiene) |
| `select <viewId>` | Select a tab by view ID |
| `lock` / `unlock` | Lock tab from human input during automation |
| `back` / `forward` / `reload` | History and reload |
| `url` / `title` | Current URL or document title |

### Interaction (prefer refs from snapshot)

| Command | Description |
|---------|-------------|
| `snapshot` / `snap` / `refs` | Accessibility tree with refs (`e1`, …). Interactive by default |
| `click <ref\|css>` | Click element (`--snap`, `--wait-nav` optional) |
| `dblclick <ref\|css>` | Double-click |
| `rightclick <ref\|css>` | Right-click / context menu |
| `type <ref\|css> <text>` | Type (append) into element |
| `fill <ref\|css> <text>` | Clear and fill element |
| `select-option <ref\|css> <value\|label>` | Choose a `<select>` option |
| `scroll [ref\|css] [--y N] [--top N]` | Scroll window or element |
| `hover <ref>` | Hover by ref |
| `press <key>` | Key press (`Enter`, `Tab`, `Escape`, …) |

### Wait, viewport, capture, debug

| Command | Description |
|---------|-------------|
| `wait` / `wait-for` | Poll until condition (see flags below) |
| `resize <W> <H>` | Resize viewport |
| `screenshot [path.png]` | Capture viewport (default under `/tmp`) |
| `inspect` / `dom` | Structured page summary |
| `console` / `logs` | Console messages |
| `network` | Network requests |
| `eval` / `evaluate <js>` | Run JavaScript in the page |

#### `wait` flags

| Flag | Meaning |
|------|---------|
| `--url <substr>` | URL contains substring |
| `--text <str>` | Page/snapshot text contains string |
| `--ref <eN>` | Ref exists / is available |
| `--selector <css>` | CSS selector matches (also positional) |
| `--timeout <ms>` | Max wait (default **30000**) |

Examples:

```bash
cursor-browser --workspace my-app wait --url /dashboard --timeout 15000
cursor-browser --workspace my-app wait --text "Welcome"
cursor-browser --workspace my-app wait --ref e12
cursor-browser --workspace my-app wait --selector "button.save"
```

### Multi-window routing order

When you have several Cursor projects open, the CLI picks a target in this order:

1. `--port` / `CURSOR_BROWSER_CLI_PORT`  
2. `--workspace` / `CURSOR_BROWSER_WORKSPACE` / `CURSOR_BROWSER_PROJECT`  
3. Match current `cwd` to a registered workspace folder (strong match only)  
4. Single open instance  
5. **Fail closed** — never silently open another project when multiple bridges are live  

Shared `~/.cursor-browser-cli/port` is only used when **no** instances are registered (recovery), not as a multi-window fallback.

```bash
cursor-browser windows
cursor-browser pin
eval $(cursor-browser pin --export)
cursor-browser whoami
cursor-browser open http://localhost:3000
# or without env:
cursor-browser --workspace af-exec-travel open http://localhost:3000
```

`pin` / `resolve` output (human):

```text
project:  my-app
path:     /Users/you/Developer/my-app
port:     17375
how:      cwd (score 100)
live:     yes

# Pin this project for the rest of the shell/session:
export CURSOR_BROWSER_WORKSPACE='my-app' CURSOR_BROWSER_CLI_PORT=17375
```

---

## MCP server

Stdio MCP server for agents that prefer tools over shelling out.

After `npm install -g cursor-browser-cli`, the bin **`cursor-browser-mcp`** is on your PATH.

### Register

```bash
# Grok Build
grok mcp add cursor-browser -- cursor-browser-mcp

# Claude Code
claude mcp add cursor-browser -- cursor-browser-mcp
```

Any stdio MCP client:

```json
{
  "mcpServers": {
    "cursor-browser": {
      "command": "cursor-browser-mcp"
    }
  }
}
```

Fallback (from a clone or if the bin is not on PATH):

```json
{
  "mcpServers": {
    "cursor-browser": {
      "command": "node",
      "args": ["/absolute/path/to/cursor-browser-cli/mcp/server.mjs"]
    }
  }
}
```

Optional env on the server process:

- `CURSOR_BROWSER_WORKSPACE`  
- `CURSOR_BROWSER_CLI_PORT`  

Or pass `workspace` on each tool call. **With multiple Cursor projects open, `workspace` is required** (MCP fails closed instead of opening the wrong project).

### Agent pin flow (MCP)

1. `browser_windows` — list project → port  
2. `browser_resolve` (or `browser_pin`) — returns `workspace`, `port`, and pin instructions  
3. Pass that `workspace` on every subsequent `browser_*` call  

### Tools

All tools accept optional **`workspace`** (project folder name or path) unless noted. With multiple live bridges, pass it every time.

| Tool | Purpose |
|------|---------|
| `browser_windows` | List live bridges (project → port) |
| `browser_resolve` / `browser_pin` | Discover project + port for this agent; pin before open |
| `browser_status` | Health + workspace for a window |
| `browser_open` | Open/reuse single tab, navigate, return ref snapshot |
| `browser_navigate` | Navigate active tab + snapshot |
| `browser_snapshot` | Accessibility snapshot with refs (`interactive` optional) |
| `browser_click` | Click by `ref` or `selector` (`snapshot`, `waitNavigation` optional) |
| `browser_dblclick` | Double-click |
| `browser_rightclick` | Right-click / context menu |
| `browser_type` | Type (append) by `ref` or `selector` |
| `browser_fill` | Clear + fill by `ref` or `selector` |
| `browser_scroll` | Scroll window or element |
| `browser_select_option` | Choose a `<select>` option by value/label/index |
| `browser_hover` | Hover by `ref` |
| `browser_press` | Press key (`Enter` submits forms) |
| `browser_wait` | Wait for URL/text/ref/selector (`timeoutMs`, etc.) |
| `browser_lock` / `browser_unlock` | Tab lock |
| `browser_resize` | Viewport size (`width`, `height`) |
| `browser_screenshot` | PNG (+ image content when data URL is available) |
| `browser_inspect` | DOM/meta/links/inputs/body summary |
| `browser_console` | Console log dump |
| `browser_network` | Network request dump |
| `browser_evaluate` | Run `script` in page |
| `browser_tabs` | List view IDs |
| `browser_url` / `browser_title` | Current URL / title |
| `browser_back` / `browser_forward` / `browser_reload` | History / reload |

**Screenshot note:** When the page returns a data URL, the MCP layer can attach an **image** content block for vision-capable models, plus a text payload with the saved path.

---

## Skills

`npm install -g` / `cursor-browser setup` copies `skill/SKILL.md` to:

- `~/.grok/skills/cursor-browser/SKILL.md`  
- `~/.claude/skills/cursor-browser/SKILL.md`  
- `~/.agents/skills/cursor-browser/SKILL.md`  
- `~/.cursor/skills/cursor-browser/SKILL.md`  
- `~/.codex/skills/cursor-browser/SKILL.md`  

The skill describes **only** the Cursor Browser Tab. It does not depend on or install any external-browser stack.

The skill teaches agents:

- Always route the correct Cursor window (`windows` / `--workspace`)  
- Preferred **snapshot → ref click/fill → wait** loop  
- When to screenshot, inspect, console, network  
- Failure modes (stale refs, wrong project, connection refused)

---

## Architecture

```
┌─ Cursor window: your-project ──────────────────────────┐
│  Extension host HTTP  127.0.0.1:1737x                   │
│         │                                              │
│         │  cursor.browserView.*                        │
│         ▼                                              │
│  Browser Tab                                           │
│  · refs via data-cursor-ref after snapshot             │
│  · DOM click/type/fill (not raw CDP Input)             │
└────────────────────────────────────────────────────────┘
                    ▲
                    │  loopback only
     CLI  ·  MCP  ·  scripts
   (Grok / Claude Code / Codex / shell)
```

| Piece | Role |
|-------|------|
| `extension/` | VS Code/Cursor extension: HTTP API, workspace registry, status bar, `cursor.browserView.*` |
| `cli/cursor-browser` | Multi-window client; resolves port; pretty-prints actions |
| `mcp/server.mjs` | Stdio MCP → same HTTP actions |
| `skill/SKILL.md` | Agent instructions for the preferred loop |
| `scripts/install.sh` | CLI symlink, extension copy, skills, MCP hints |

**On-disk state** (`~/.cursor-browser-cli/`):

| File | Purpose |
|------|---------|
| `instances.json` | Registered windows (workspace paths, ports, PIDs) |
| `port` | Last/default port hint |
| `bridge.log` | Extension host log |

Ports start at **17373** and try up to **32** candidates if the preferred port is taken (one port per Cursor window).

---

## How agents should use it

### Typical product/UI session

1. `browser_windows` or `cursor-browser windows` — list project → port  
2. `browser_resolve` / `cursor-browser pin` — pin this project (env or `workspace` arg)  
3. `open` / `browser_open` on `http://localhost:…` or staging URL  
4. Read refs from the snapshot  
5. `click` / `fill` / `press`  
6. `wait` for URL or text  
7. New `snapshot` after major UI change  
8. `screenshot` or `inspect` when stuck  

### Multi-project day

Always discover then pin:

```bash
cursor-browser windows
cursor-browser pin
eval $(cursor-browser pin --export)

cursor-browser --workspace project-a open http://localhost:3000
cursor-browser --workspace project-b open http://localhost:4000
```

Or set `CURSOR_BROWSER_WORKSPACE` in that agent’s shell profile / MCP env.

### Switching agents mid-project

The Browser Tab is owned by the **Cursor window**, not by a single agent process. You can:

1. Use Cursor Agent for some steps (built-in tools)  
2. Switch to Claude Code / Grok / Codex in the terminal  
3. Continue with `cursor-browser` or MCP on the **same** tab  

That continuity is the whole point of this tool.

---

## Security

- The HTTP server binds to **loopback only** (`127.0.0.1`).  
- Anyone who can reach that port on your machine can drive the Browser Tab (navigate, click, **run page JS**, read console/network).  
- Treat it like a **local debugger**: do not tunnel or expose the port; do not run on untrusted multi-user machines without isolation.  
- `eval` / `browser_evaluate` execute arbitrary page JavaScript — only run code you trust.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Connection refused / empty `windows` | **`cursor-browser doctor`** then **`cursor-browser recover`**. Clears stale ports, asks extension to restart (file trigger), optionally reloads Cursor. Browser Tab open ≠ bridge up. |
| After reboot bridge dead | Extension host did not re-bind HTTP. `recover` → wait → `windows`. Ensure **Cursor Browser CLI** extension is Enabled. |
| Wrong project / wrong app | `cursor-browser windows` → `pin` → `--workspace <name>` or `eval $(cursor-browser pin --export)` |
| Multiple windows; cannot guess | Pass `--workspace` / MCP `workspace`; CLI and MCP fail closed |
| Stale ref / element not found | New `snapshot` / `open` / `nav`; never reuse refs across big DOM changes |
| Race / empty or intermediate page | `wait --url` / `--text` / `--ref` / `--selector` with a higher `--timeout` |
| Extra tabs / flaky targeting | `close`, then `open` or `nav` to enforce single-tab |
| MCP tools missing | Re-register MCP with **absolute** path to `mcp/server.mjs`; restart the agent |
| CLI not found | Ensure `~/.local/bin` is on `PATH`, or call the script by full path |
| CDP Input blocked | Expected — use `click` / `type` / `fill` / `press` (DOM events), not raw CDP Input |

Logs: `~/.cursor-browser-cli/bridge.log`

---

## Repo layout

```text
cursor-browser-cli/
├── README.md
├── LICENSE                 # MIT
├── package.json            # npm package (bins + postinstall setup)
├── cli/
│   └── cursor-browser      # CLI entry (Node)
├── extension/
│   ├── package.json
│   ├── extension.js        # HTTP API + cursor.browserView.*
│   └── snapshot.js         # Accessibility snapshot + refs
├── mcp/
│   └── server.mjs          # MCP stdio server → bin: cursor-browser-mcp
├── scripts/
│   ├── setup.js            # extension + skills install
│   └── install.sh          # thin wrapper → setup.js
└── skill/
    └── SKILL.md            # Agent skill template
```

**No runtime npm dependencies** — Node built-ins only (`http`, `fs`, `path`, `os`, etc.).

---

## Development notes

- Extension activation: `onStartupFinished`  
- Preferred port configurable via `cursorBrowserCli.port`  
- Clients still understand legacy state dirs / names from earlier renames for smoother upgrades  
- After changing extension code: `cursor-browser setup` (or `npm run setup`) and **Reload Window**  
- Publish: `npm publish` (requires npm login)

---

## License

[MIT](./LICENSE) © Brandon Charleson

---

## Contributing / sharing

This repo is intended to be shared as open source so CLI agents in Cursor can share one Browser Tab.

If you publish or fork:

1. Keep the **why** clear: multi-agent access to Cursor’s Browser Tab  
2. Document both **CLI** and **MCP** equally  
3. Stress **workspace routing** and the **snapshot → ref → wait** loop  

Issues and PRs that improve multi-window routing, snapshot quality, or agent docs are especially welcome.
