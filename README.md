# cursor-browser-cli

**Drive Cursor IDE’s built-in Browser Tab from the terminal** — Grok Build, Claude Code, Codex, OpenCode, or plain shell — without leaving Cursor and without external Chrome.

Stay in a long chat in the integrated terminal. Navigate, take **ref snapshots**, click/type/fill by **ref**, wait for page state, lock the tab, screenshot, and inspect console/network/DOM — all on the **same** Browser Tab you see in the IDE.

```
Grok / Claude Code / Codex / shell
        │  CLI  or  MCP stdio
        ▼
  cli/cursor-browser  ·  mcp/server.mjs
        │  HTTP 127.0.0.1:<port>
        ▼
  Cursor extension (workspace host)
        │  cursor.browserView.*
        ▼
  Cursor Browser Tab  (per project window)
```

---

## Why

Cursor’s Browser Automation is wired to **Cursor Agent** only.  
If you live in **CLI agents inside Cursor**, you need this bridge.

| Goal | Tool |
|------|------|
| Terminal agent + Cursor Browser Tab | **cursor-browser-cli** |
| Cursor’s own Agent | Built-in browser tools |
| Real Chrome profile | Chrome MCP / extensions |
| Headless CI | Playwright MCP |

---

## Features

### Agent-grade interaction
- **Accessibility snapshot with refs** (`e1`, `e5`, …) — YAML tree for reliable targeting  
- **Click / type / fill / hover by ref** (or CSS selector fallback)  
- **`wait`** for URL, text, ref, or selector (fixes agent races)  
- **Lock / unlock** tab during automation  
- **Resize** viewport  
- Navigate / open returns a **snapshot by default**

### CLI-first
- `cursor-browser` on your PATH  
- Multi-window: `--workspace af-exec-travel` or match `cwd`  
- Single-tab policy: reuse one tab, `close` extras  

### Under the hood
- **Screenshot** (PNG)  
- **inspect** — meta, counts, headings, links, inputs, body text  
- **console** / **network** (Cursor `getConsoleLogs` / `getNetworkRequests`)  
- **eval** — arbitrary page JS  

### Multi-agent
- Grok Build skill + MCP  
- Claude Code / Codex / any stdio MCP client  

---

## Install

```bash
git clone https://github.com/brandoncharleson/cursor-browser-cli.git
cd cursor-browser-cli
./scripts/install.sh
```

Then **Reload Window** in each Cursor project you use  
(`Cmd+Shift+P` → Developer: Reload Window).

Status bar: `af-exec-travel :17375` (workspace + port).

```bash
cursor-browser windows
cursor-browser --workspace <project> open https://example.com
cursor-browser --workspace <project> snapshot
```

---

## Quick start (agent loop)

```bash
export WS=af-exec-travel   # your folder name

cursor-browser --workspace $WS close
cursor-browser --workspace $WS open http://localhost:3000
# → prints snapshot with [ref=e…]

cursor-browser --workspace $WS click e5
cursor-browser --workspace $WS fill e3 "hello"
cursor-browser --workspace $WS press Enter
cursor-browser --workspace $WS wait --url /results --timeout 15000
cursor-browser --workspace $WS screenshot /tmp/out.png
cursor-browser --workspace $WS inspect
```

**Rule:** take a fresh `snapshot` after any navigation or big DOM change before using refs.

---

## CLI

```text
cursor-browser [--workspace NAME|PATH] [--port N] <command>

windows | whoami | status

open <url>          # single tab + nav + snapshot
nav <url>           # navigate + snapshot
tabs | close
lock | unlock
snapshot | snap     # ref tree (default interactive)
click <ref|css>
type  <ref|css> <text>
fill  <ref|css> <text>
hover <ref>
press Enter|Tab|…

wait --url S | --text S | --ref eN | --selector CSS [--timeout ms]
resize W H

screenshot [path.png]
inspect | console | network | eval <js>
back | forward | reload
```

### Routing (multiple Cursor windows)

1. `--port` / `CURSOR_BROWSER_CLI_PORT`  
2. `--workspace` / `CURSOR_BROWSER_WORKSPACE`  
3. Match `cwd` to workspace folder  
4. Process discovery fallback  
5. Single open instance  

```bash
cursor-browser windows
cursor-browser --workspace af-exec-travel whoami
```

---

## MCP (Claude Code, Codex, Grok, …)

```bash
# Grok
grok mcp add cursor-browser -- node /absolute/path/to/cursor-browser-cli/mcp/server.mjs

# Claude Code
claude mcp add cursor-browser -- node /absolute/path/to/cursor-browser-cli/mcp/server.mjs
```

Any stdio MCP client:

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

Optional env: `CURSOR_BROWSER_WORKSPACE`, `CURSOR_BROWSER_CLI_PORT`.

### Tools

| Tool | Purpose |
|------|---------|
| `browser_windows` / `browser_status` | Routing |
| `browser_open` / `browser_navigate` | Nav + snapshot |
| `browser_snapshot` | Ref tree |
| `browser_click` / `browser_type` / `browser_fill` / `browser_hover` | Interact |
| `browser_press` | Keys / form submit |
| `browser_wait` | Poll URL/text/ref/selector |
| `browser_lock` / `browser_unlock` | Tab lock |
| `browser_resize` | Viewport |
| `browser_screenshot` | PNG (+ image content when available) |
| `browser_inspect` / `browser_console` / `browser_network` | Under the hood |
| `browser_evaluate` | Page JS |
| `browser_tabs` / `browser_url` / `browser_title` | State |
| `browser_back` / `browser_forward` / `browser_reload` | History |

All accept optional `workspace`.

---

## Skills

Install copies skill templates to:

- `~/.grok/skills/cursor-browser/SKILL.md`  
- `~/.claude/skills/cursor-browser/SKILL.md` (if present)  
- `~/.agents/skills/cursor-browser/SKILL.md` (if present)  

Skill teaches the **snapshot → ref click/fill → wait** loop and multi-window routing.

---

## Architecture

```
┌─ Cursor window: your-project ─────────────────────────┐
│  Extension host HTTP :1737x                           │
│       │ cursor.browserView.*                          │
│       ▼                                               │
│  Browser Tab (refs via data-cursor-ref after snapshot)│
└───────────────────────────────────────────────────────┘
            ▲
            │ 127.0.0.1 only
   CLI / MCP proxy  ←  Grok · Claude · Codex · scripts
```

State: `~/.cursor-browser-cli/instances.json`, `port`, `bridge.log`.

---

## Security

- Loopback only.  
- Full control of whatever the Browser Tab can open (including page JS).  
- Treat like a local debugger; do not expose the port.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Connection refused | `./scripts/install.sh` + Reload Window |
| Wrong project | `windows` + `--workspace` |
| Stale ref | New `snapshot` |
| Races | `wait --url` / `--text` / `--ref` |
| Extra tabs | `close` then prefer `nav` |
| CDP Input blocked | Expected — use click/type/fill/press (DOM) |

---

## Repo layout

```
cursor-browser-cli/
├── README.md
├── LICENSE
├── package.json
├── cli/cursor-browser
├── extension/
│   ├── package.json
│   ├── extension.js
│   └── snapshot.js          # ref accessibility snapshot
├── mcp/server.mjs
├── scripts/install.sh
└── skill/SKILL.md
```

No runtime npm dependencies (Node built-ins only).

---

## License

MIT
