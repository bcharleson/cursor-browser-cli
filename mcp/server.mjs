#!/usr/bin/env node
/**
 * MCP stdio server for Cursor Browser Bridge.
 * Proxies tool calls to the extension HTTP API on localhost.
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STATE_DIR = path.join(os.homedir(), ".cursor-browser-bridge");
const INSTANCES_FILE = path.join(STATE_DIR, "instances.json");
const PORT_FILE = path.join(STATE_DIR, "port");
const DEFAULT_PORT = 17373;

function readInstances() {
  try {
    if (!fs.existsSync(INSTANCES_FILE)) return {};
    return JSON.parse(fs.readFileSync(INSTANCES_FILE, "utf8") || "{}");
  } catch {
    return {};
  }
}

function scoreInstance(inst, query) {
  if (!query) return 0;
  const q = path.resolve(query);
  const qBase = path.basename(q).toLowerCase();
  const qLower = String(query).toLowerCase();
  let score = 0;
  const paths = inst.workspacePaths || (inst.primaryPath ? [inst.primaryPath] : []);
  const names = inst.workspaceNames || (inst.primaryName ? [inst.primaryName] : []);
  const bases = inst.basenames || paths.map((p) => path.basename(p));
  for (const p of paths) {
    const rp = path.resolve(p);
    if (q === rp) score = Math.max(score, 100);
    else if (q.startsWith(rp + path.sep)) score = Math.max(score, 90);
  }
  for (const b of bases) {
    if (b.toLowerCase() === qBase || b.toLowerCase() === qLower) score = Math.max(score, 80);
  }
  for (const n of names) {
    if (n.toLowerCase() === qLower) score = Math.max(score, 85);
  }
  return score;
}

/** Resolve port for the caller's workspace (cwd / env). */
function resolvePort(workspaceHint) {
  if (process.env.CURSOR_BROWSER_BRIDGE_PORT) {
    return Number(process.env.CURSOR_BROWSER_BRIDGE_PORT);
  }
  const instances = Object.values(readInstances());
  const query =
    workspaceHint ||
    process.env.CURSOR_BROWSER_WORKSPACE ||
    process.env.CURSOR_BROWSER_PROJECT ||
    process.cwd();

  if (instances.length) {
    let best = null;
    let bestScore = 0;
    for (const inst of instances) {
      const s = scoreInstance(inst, query);
      if (s > bestScore) {
        bestScore = s;
        best = inst;
      }
    }
    if (best && bestScore >= 50) return best.port;
    if (instances.length === 1) return instances[0].port;
  }

  try {
    if (fs.existsSync(PORT_FILE)) {
      const n = Number(fs.readFileSync(PORT_FILE, "utf8").trim());
      if (n > 0) return n;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_PORT;
}

function httpJson(method, pathname, body, workspaceHint) {
  const port = resolvePort(workspaceHint);
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
        timeout: 60000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          try {
            const data = JSON.parse(raw || "{}");
            if (data && typeof data === "object") {
              data._bridge = { port, workspaceHint: workspaceHint || process.cwd() };
            }
            resolve(data);
          } catch {
            resolve({ ok: false, error: "Non-JSON response", raw });
          }
        });
      }
    );
    req.on("error", (err) => {
      reject(
        new Error(
          `Bridge unreachable on 127.0.0.1:${port}: ${err.message}. Open Cursor with cursor-browser-bridge installed. Use browser_windows to list instances.`
        )
      );
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Bridge request timed out"));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function act(body, workspaceHint) {
  return httpJson("POST", "/action", body, workspaceHint);
}

const WS_PROP = {
  workspace: {
    type: "string",
    description:
      "Project/window to target (folder name or path), e.g. af-exec-travel. Defaults to MCP server cwd.",
  },
};

const TOOLS = [
  {
    name: "browser_windows",
    description:
      "List Cursor windows that have Browser Bridge running (port + workspace). Use this first when multiple projects are open.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "browser_status",
    description:
      "Health check for the bridge in a specific Cursor project window: port, tabs, workspace.",
    inputSchema: {
      type: "object",
      properties: { ...WS_PROP },
      additionalProperties: false,
    },
  },
  {
    name: "browser_probe",
    description:
      "List which Cursor internal browserView commands are registered in the target window.",
    inputSchema: {
      type: "object",
      properties: { ...WS_PROP },
      additionalProperties: false,
    },
  },
  {
    name: "browser_open",
    description:
      "Open or focus Cursor Browser Tab IN the target project window and optionally navigate.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to open (optional)" },
        ...WS_PROP,
      },
      additionalProperties: false,
    },
  },
  {
    name: "browser_navigate",
    description: "Navigate the Browser Tab in the target project window.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        viewId: { type: "string", description: "Optional tab/view id" },
        ...WS_PROP,
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "browser_tabs",
    description: "List open Browser Tab views in the target project window.",
    inputSchema: {
      type: "object",
      properties: { ...WS_PROP },
      additionalProperties: false,
    },
  },
  {
    name: "browser_url",
    description: "Get the current URL of the Browser Tab in the target window.",
    inputSchema: {
      type: "object",
      properties: { viewId: { type: "string" }, ...WS_PROP },
      additionalProperties: false,
    },
  },
  {
    name: "browser_title",
    description: "Get the page title of the Browser Tab in the target window.",
    inputSchema: {
      type: "object",
      properties: { viewId: { type: "string" }, ...WS_PROP },
      additionalProperties: false,
    },
  },
  {
    name: "browser_snapshot",
    description: "Screenshot the Browser Tab in the target project window.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Optional file path to save PNG" },
        fullPage: { type: "boolean" },
        viewId: { type: "string" },
        ...WS_PROP,
      },
      additionalProperties: false,
    },
  },
  {
    name: "browser_evaluate",
    description: "Run JavaScript in the Browser Tab page of the target window.",
    inputSchema: {
      type: "object",
      properties: {
        script: { type: "string" },
        viewId: { type: "string" },
        ...WS_PROP,
      },
      required: ["script"],
      additionalProperties: false,
    },
  },
  {
    name: "browser_back",
    description: "Go back in Browser Tab history (target window).",
    inputSchema: {
      type: "object",
      properties: { viewId: { type: "string" }, ...WS_PROP },
      additionalProperties: false,
    },
  },
  {
    name: "browser_forward",
    description: "Go forward in Browser Tab history (target window).",
    inputSchema: {
      type: "object",
      properties: { viewId: { type: "string" }, ...WS_PROP },
      additionalProperties: false,
    },
  },
  {
    name: "browser_reload",
    description: "Reload the Browser Tab in the target window.",
    inputSchema: {
      type: "object",
      properties: { viewId: { type: "string" }, ...WS_PROP },
      additionalProperties: false,
    },
  },
  {
    name: "browser_select",
    description: "Select / focus a Browser Tab by viewId in the target window.",
    inputSchema: {
      type: "object",
      properties: { viewId: { type: "string" }, ...WS_PROP },
      required: ["viewId"],
      additionalProperties: false,
    },
  },
  {
    name: "browser_cdp",
    description: "Send a raw CDP command to the Browser Tab in the target window.",
    inputSchema: {
      type: "object",
      properties: {
        method: { type: "string", description: "e.g. Runtime.evaluate, Page.reload" },
        params: { type: "object" },
        viewId: { type: "string" },
        ...WS_PROP,
      },
      required: ["method"],
      additionalProperties: false,
    },
  },
];

async function callTool(name, args = {}) {
  const ws = args.workspace;
  switch (name) {
    case "browser_windows": {
      const instances = Object.values(readInstances());
      const enriched = [];
      for (const inst of instances) {
        try {
          const data = await httpJson("GET", "/whoami", null, inst.primaryPath || inst.primaryName);
          enriched.push({
            port: inst.port,
            primaryName: data.workspace?.primaryName || inst.primaryName,
            primaryPath: data.workspace?.primaryPath || inst.primaryPath,
            live: true,
          });
        } catch {
          enriched.push({
            port: inst.port,
            primaryName: inst.primaryName,
            primaryPath: inst.primaryPath,
            live: false,
          });
        }
      }
      return { ok: true, instances: enriched, cwd: process.cwd() };
    }
    case "browser_status":
      return httpJson("GET", "/status", null, ws);
    case "browser_probe":
      return httpJson("GET", "/probe", null, ws);
    case "browser_open":
      return act({ action: "open", url: args.url }, ws);
    case "browser_navigate":
      return act({ action: "navigate", url: args.url, viewId: args.viewId }, ws);
    case "browser_tabs":
      return act({ action: "tabs" }, ws);
    case "browser_url":
      return act({ action: "url", viewId: args.viewId }, ws);
    case "browser_title":
      return act({ action: "title", viewId: args.viewId }, ws);
    case "browser_snapshot":
      return act(
        {
          action: "screenshot",
          path: args.path,
          fullPage: args.fullPage,
          viewId: args.viewId,
        },
        ws
      );
    case "browser_evaluate":
      return act({ action: "evaluate", script: args.script, viewId: args.viewId }, ws);
    case "browser_back":
      return act({ action: "back", viewId: args.viewId }, ws);
    case "browser_forward":
      return act({ action: "forward", viewId: args.viewId }, ws);
    case "browser_reload":
      return act({ action: "reload", viewId: args.viewId }, ws);
    case "browser_select":
      return act({ action: "select", viewId: args.viewId }, ws);
    case "browser_cdp":
      return act(
        {
          action: "cdp",
          method: args.method,
          params: args.params || {},
          viewId: args.viewId,
        },
        ws
      );
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}

// Minimal MCP JSON-RPC over stdio (no SDK dependency)
function writeMessage(obj) {
  const json = JSON.stringify(obj);
  const msg = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
  process.stdout.write(msg);
}

function sendResult(id, result) {
  writeMessage({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  writeMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

function textResult(data) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }] };
}

let buffer = Buffer.alloc(0);

process.stdin.on("data", async (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    const header = buffer.slice(0, headerEnd).toString("utf8");
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const len = Number(match[1]);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + len) break;
    const body = buffer.slice(bodyStart, bodyStart + len).toString("utf8");
    buffer = buffer.slice(bodyStart + len);

    let msg;
    try {
      msg = JSON.parse(body);
    } catch {
      continue;
    }

    const { id, method, params } = msg;

    try {
      if (method === "initialize") {
        sendResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "cursor-browser-bridge", version: "0.1.0" },
        });
      } else if (method === "notifications/initialized" || method === "initialized") {
        // no-op
      } else if (method === "tools/list") {
        sendResult(id, { tools: TOOLS });
      } else if (method === "tools/call") {
        const name = params?.name;
        const args = params?.arguments || {};
        try {
          const data = await callTool(name, args);
          sendResult(id, textResult(data));
        } catch (err) {
          sendResult(id, {
            content: [{ type: "text", text: String(err.message || err) }],
            isError: true,
          });
        }
      } else if (method === "ping") {
        sendResult(id, {});
      } else if (id !== undefined) {
        sendError(id, -32601, `Method not found: ${method}`);
      }
    } catch (err) {
      if (id !== undefined) sendError(id, -32603, String(err.message || err));
    }
  }
});

process.stdin.on("end", () => process.exit(0));

// Allow direct run check
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  // running as main — wait for stdio
}
