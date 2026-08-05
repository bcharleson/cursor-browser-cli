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
const PORT_FILE = path.join(STATE_DIR, "port");
const DEFAULT_PORT = 17373;

function resolvePort() {
  if (process.env.CURSOR_BROWSER_BRIDGE_PORT) {
    return Number(process.env.CURSOR_BROWSER_BRIDGE_PORT);
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

function httpJson(method, pathname, body) {
  const port = resolvePort();
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
            resolve(JSON.parse(raw || "{}"));
          } catch {
            resolve({ ok: false, error: "Non-JSON response", raw });
          }
        });
      }
    );
    req.on("error", (err) => {
      reject(
        new Error(
          `Bridge unreachable on 127.0.0.1:${port}: ${err.message}. Open Cursor with cursor-browser-bridge installed.`
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

async function act(body) {
  return httpJson("POST", "/action", body);
}

const TOOLS = [
  {
    name: "browser_status",
    description:
      "Health check for Cursor Browser Bridge: port, open tabs, connectivity.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "browser_probe",
    description:
      "List which Cursor internal browserView commands are registered in this Cursor build.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "browser_open",
    description:
      "Open or focus Cursor's Browser Tab and optionally navigate to a URL.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to open (optional)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "browser_navigate",
    description: "Navigate the active (or specified) Cursor Browser Tab to a URL.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        viewId: { type: "string", description: "Optional tab/view id" },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "browser_tabs",
    description: "List open Cursor Browser Tab views.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "browser_url",
    description: "Get the current URL of the active Browser Tab.",
    inputSchema: {
      type: "object",
      properties: { viewId: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "browser_title",
    description: "Get the page title of the active Browser Tab.",
    inputSchema: {
      type: "object",
      properties: { viewId: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "browser_snapshot",
    description: "Take a screenshot of the Browser Tab viewport (or full page).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Optional file path to save PNG" },
        fullPage: { type: "boolean" },
        viewId: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "browser_evaluate",
    description: "Run JavaScript in the Cursor Browser Tab page context.",
    inputSchema: {
      type: "object",
      properties: {
        script: { type: "string" },
        viewId: { type: "string" },
      },
      required: ["script"],
      additionalProperties: false,
    },
  },
  {
    name: "browser_back",
    description: "Go back in Browser Tab history.",
    inputSchema: {
      type: "object",
      properties: { viewId: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "browser_forward",
    description: "Go forward in Browser Tab history.",
    inputSchema: {
      type: "object",
      properties: { viewId: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "browser_reload",
    description: "Reload the active Browser Tab.",
    inputSchema: {
      type: "object",
      properties: { viewId: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "browser_select",
    description: "Select / focus a Browser Tab by viewId.",
    inputSchema: {
      type: "object",
      properties: { viewId: { type: "string" } },
      required: ["viewId"],
      additionalProperties: false,
    },
  },
  {
    name: "browser_cdp",
    description: "Send a raw Chrome DevTools Protocol command to the Browser Tab.",
    inputSchema: {
      type: "object",
      properties: {
        method: { type: "string", description: "e.g. Runtime.evaluate, Page.reload" },
        params: { type: "object" },
        viewId: { type: "string" },
      },
      required: ["method"],
      additionalProperties: false,
    },
  },
];

async function callTool(name, args = {}) {
  switch (name) {
    case "browser_status":
      return httpJson("GET", "/status");
    case "browser_probe":
      return httpJson("GET", "/probe");
    case "browser_open":
      return act({ action: "open", url: args.url });
    case "browser_navigate":
      return act({ action: "navigate", url: args.url, viewId: args.viewId });
    case "browser_tabs":
      return act({ action: "tabs" });
    case "browser_url":
      return act({ action: "url", viewId: args.viewId });
    case "browser_title":
      return act({ action: "title", viewId: args.viewId });
    case "browser_snapshot":
      return act({
        action: "screenshot",
        path: args.path,
        fullPage: args.fullPage,
        viewId: args.viewId,
      });
    case "browser_evaluate":
      return act({ action: "evaluate", script: args.script, viewId: args.viewId });
    case "browser_back":
      return act({ action: "back", viewId: args.viewId });
    case "browser_forward":
      return act({ action: "forward", viewId: args.viewId });
    case "browser_reload":
      return act({ action: "reload", viewId: args.viewId });
    case "browser_select":
      return act({ action: "select", viewId: args.viewId });
    case "browser_cdp":
      return act({
        action: "cdp",
        method: args.method,
        params: args.params || {},
        viewId: args.viewId,
      });
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
