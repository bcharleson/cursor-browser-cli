#!/usr/bin/env node
/**
 * MCP stdio server for cursor-browser-cli
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const STATE_DIR = path.join(os.homedir(), ".cursor-browser-cli");
const INSTANCES_FILE = path.join(STATE_DIR, "instances.json");
const PORT_FILE = path.join(STATE_DIR, "port");
const LEGACY_INSTANCES = path.join(os.homedir(), ".cursor-browser-bridge", "instances.json");
const LEGACY_PORT = path.join(os.homedir(), ".cursor-browser-bridge", "port");
const DEFAULT_PORT = 17373;

function readInstances() {
  for (const f of [INSTANCES_FILE, LEGACY_INSTANCES]) {
    try {
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8") || "{}");
    } catch {
      /* ignore */
    }
  }
  return {};
}

function portIsAlive(port) {
  try {
    execSync(
      `node -e "const n=require('net');const s=n.connect(${Number(port)},'127.0.0.1',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),400);"`,
      { stdio: "ignore" }
    );
    return true;
  } catch {
    return false;
  }
}

function listInstances() {
  const map = readInstances();
  const out = [];
  for (const inst of Object.values(map)) {
    if (inst.port && portIsAlive(Number(inst.port))) out.push(inst);
  }
  return out.sort((a, b) =>
    String(a.primaryName || "").localeCompare(String(b.primaryName || ""))
  );
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
    if (n.toLowerCase() === qLower || n.toLowerCase() === qBase) score = Math.max(score, 85);
  }
  return score;
}

function formatWindowsHint(instances) {
  return (
    instances
      .map((i) => `  :${i.port}  ${i.primaryName || "?"}  ${i.primaryPath || ""}`)
      .join("\n") +
    `\nCall browser_windows, then browser_resolve with workspace="<name>", and pass workspace on every tool call.`
  );
}

/**
 * Resolve which bridge to use. Fail closed with multiple windows (no silent wrong project).
 * Returns { port, how, instance, score?, workspace? }.
 */
function resolveTarget(workspaceHint) {
  if (process.env.CURSOR_BROWSER_CLI_PORT || process.env.CURSOR_BROWSER_BRIDGE_PORT) {
    const port = Number(
      process.env.CURSOR_BROWSER_CLI_PORT || process.env.CURSOR_BROWSER_BRIDGE_PORT
    );
    const instances = listInstances();
    const instance = instances.find((i) => Number(i.port) === port) || null;
    return {
      port,
      how: "explicit-port",
      instance,
      workspace: instance?.primaryName || null,
    };
  }

  const instances = listInstances();
  const query =
    workspaceHint ||
    process.env.CURSOR_BROWSER_WORKSPACE ||
    process.env.CURSOR_BROWSER_PROJECT ||
    null;

  if (!instances.length) {
    for (const f of [PORT_FILE, LEGACY_PORT]) {
      try {
        if (fs.existsSync(f)) {
          const n = Number(fs.readFileSync(f, "utf8").trim());
          if (n > 0 && portIsAlive(n)) {
            return { port: n, how: "port-file", instance: null, workspace: null };
          }
        }
      } catch {
        /* ignore */
      }
    }
    return {
      port: DEFAULT_PORT,
      how: "default-no-bridge",
      instance: null,
      workspace: null,
    };
  }

  if (query) {
    let best = null;
    let bestScore = 0;
    for (const inst of instances) {
      const s = scoreInstance(inst, query);
      if (s > bestScore) {
        bestScore = s;
        best = inst;
      }
    }
    if (best && bestScore >= 50) {
      return {
        port: best.port,
        how: "workspace-query",
        instance: best,
        score: bestScore,
        workspace: best.primaryName || null,
      };
    }
    throw new Error(
      `No bridge matched workspace "${query}".\n` + formatWindowsHint(instances)
    );
  }

  // No workspace hint: try cwd (only strong matches), else single instance, else fail closed.
  const cwd = process.cwd();
  let best = null;
  let bestScore = 0;
  for (const inst of instances) {
    const s = scoreInstance(inst, cwd);
    if (s > bestScore) {
      bestScore = s;
      best = inst;
    }
  }
  if (best && bestScore >= 70) {
    return {
      port: best.port,
      how: "cwd",
      instance: best,
      score: bestScore,
      workspace: best.primaryName || null,
    };
  }
  if (instances.length === 1) {
    return {
      port: instances[0].port,
      how: "single-instance",
      instance: instances[0],
      workspace: instances[0].primaryName || null,
    };
  }
  throw new Error(
    `Multiple Cursor windows; pass workspace on each tool call.\n` +
      formatWindowsHint(instances)
  );
}

function buildPinPayload(target, whoamiData = {}) {
  const ws = whoamiData.workspace || {};
  const workspace =
    ws.primaryName ||
    target.instance?.primaryName ||
    target.workspace ||
    path.basename(process.cwd());
  const workspacePath =
    ws.primaryPath || target.instance?.primaryPath || process.cwd();
  const port = Number(whoamiData.port || target.port);
  return {
    ok: true,
    workspace,
    workspacePath,
    port,
    how: target.how,
    score: target.score ?? null,
    cwd: process.cwd(),
    live: whoamiData.ok !== false && !!whoamiData.version,
    version: whoamiData.version || null,
    instanceId: whoamiData.instanceId || target.instance?.id || null,
    exports: {
      CURSOR_BROWSER_WORKSPACE: workspace,
      CURSOR_BROWSER_CLI_PORT: String(port),
    },
    agent: {
      step1: "browser_windows → pick project",
      step2: `browser_resolve with workspace="${workspace}" (or match cwd)`,
      step3: `Pass workspace="${workspace}" on every subsequent browser_* call`,
      note: "Prefer workspace name over port; ports can change after recover/restart.",
    },
  };
}

function httpJson(method, pathname, body, workspaceHint, explicitPort = null) {
  let target;
  let port;
  if (explicitPort != null) {
    port = Number(explicitPort);
    target = {
      port,
      how: "explicit-port",
      instance: null,
      workspace: workspaceHint || null,
    };
  } else {
    target = resolveTarget(workspaceHint);
    port = target.port;
  }
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
        timeout: 90000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
            if (data && typeof data === "object") {
              data._bridge = {
                port,
                how: target.how,
                workspace:
                  target.workspace ||
                  target.instance?.primaryName ||
                  data.workspace?.primaryName ||
                  workspaceHint ||
                  null,
                score: target.score ?? null,
                workspaceHint: workspaceHint || process.env.CURSOR_BROWSER_WORKSPACE || null,
              };
            }
            resolve(data);
          } catch {
            resolve({ ok: false, error: "Non-JSON response" });
          }
        });
      }
    );
    req.on("error", (err) =>
      reject(new Error(`Bridge unreachable :${port}: ${err.message}`))
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

const act = (body, ws) => httpJson("POST", "/action", body, ws);
const WS = {
  workspace: {
    type: "string",
    description:
      "REQUIRED with multiple Cursor projects open. Project folder name or absolute path (e.g. af-exec-travel). Get from browser_resolve / browser_windows.",
  },
};

const TOOLS = [
  {
    name: "browser_windows",
    description:
      "List live Cursor windows with project name and bridge port. Call first on multi-project days, then browser_resolve, then pass workspace on every tool.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "browser_resolve",
    description:
      "Discover which project/port this agent should use. Returns workspace name, path, port, and pin instructions. Call before open when multiple Cursor projects are open. Pass the same workspace on later tools.",
    inputSchema: { type: "object", properties: { ...WS }, additionalProperties: false },
  },
  {
    name: "browser_pin",
    description:
      "Alias of browser_resolve: pin current project → bridge port for subsequent browser_* calls.",
    inputSchema: { type: "object", properties: { ...WS }, additionalProperties: false },
  },
  {
    name: "browser_status",
    description: "Health + workspace for a Cursor window (include workspace when multi-project)",
    inputSchema: { type: "object", properties: { ...WS }, additionalProperties: false },
  },
  {
    name: "browser_open",
    description:
      "Open/reuse single Browser Tab, navigate, return ref snapshot. Pass workspace from browser_resolve when multiple projects are open.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" }, ...WS },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "browser_navigate",
    description: "Navigate active tab and return accessibility snapshot with refs",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" }, viewId: { type: "string" }, ...WS },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "browser_snapshot",
    description: "Accessibility snapshot with element refs (e1, e2, …) for click/type/fill",
    inputSchema: {
      type: "object",
      properties: {
        interactive: { type: "boolean" },
        viewId: { type: "string" },
        ...WS,
      },
      additionalProperties: false,
    },
  },
  {
    name: "browser_click",
    description: "Click by ref (from snapshot) or CSS selector. Optional snapshot/waitNavigation.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        selector: { type: "string" },
        viewId: { type: "string" },
        snapshot: { type: "boolean", description: "Return fresh ref snapshot after click" },
        waitNavigation: { type: "boolean", description: "Wait for URL change after click" },
        timeoutMs: { type: "number" },
        ...WS,
      },
      additionalProperties: false,
    },
  },
  {
    name: "browser_dblclick",
    description: "Double-click by ref or CSS selector",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        selector: { type: "string" },
        viewId: { type: "string" },
        snapshot: { type: "boolean" },
        ...WS,
      },
      additionalProperties: false,
    },
  },
  {
    name: "browser_rightclick",
    description: "Right-click / contextmenu by ref or CSS selector",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        selector: { type: "string" },
        viewId: { type: "string" },
        snapshot: { type: "boolean" },
        ...WS,
      },
      additionalProperties: false,
    },
  },
  {
    name: "browser_type",
    description: "Type into element by ref or selector (appends characters)",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        selector: { type: "string" },
        text: { type: "string" },
        viewId: { type: "string" },
        snapshot: { type: "boolean" },
        ...WS,
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "browser_fill",
    description: "Clear and fill element by ref or selector",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        selector: { type: "string" },
        value: { type: "string" },
        text: { type: "string" },
        viewId: { type: "string" },
        snapshot: { type: "boolean" },
        ...WS,
      },
      additionalProperties: false,
    },
  },
  {
    name: "browser_scroll",
    description: "Scroll window or element (ref/selector). Use y/x deltas or top/left absolute.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        selector: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        top: { type: "number" },
        left: { type: "number" },
        viewId: { type: "string" },
        snapshot: { type: "boolean" },
        ...WS,
      },
      additionalProperties: false,
    },
  },
  {
    name: "browser_select_option",
    description: "Choose an option on a <select> by value, label, or index",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        selector: { type: "string" },
        value: { type: "string" },
        label: { type: "string" },
        index: { type: "number" },
        viewId: { type: "string" },
        snapshot: { type: "boolean" },
        ...WS,
      },
      additionalProperties: false,
    },
  },
  {
    name: "browser_hover",
    description: "Hover element by snapshot ref",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        viewId: { type: "string" },
        snapshot: { type: "boolean" },
        ...WS,
      },
      required: ["ref"],
      additionalProperties: false,
    },
  },
  {
    name: "browser_press",
    description: "Press key (Enter submits forms)",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string" },
        viewId: { type: "string" },
        snapshot: { type: "boolean" },
        ...WS,
      },
      required: ["key"],
      additionalProperties: false,
    },
  },
  {
    name: "browser_wait",
    description: "Wait for url/text/ref/selector (agent race fix)",
    inputSchema: {
      type: "object",
      properties: {
        urlContains: { type: "string" },
        host: { type: "string" },
        text: { type: "string" },
        ref: { type: "string" },
        selector: { type: "string" },
        timeoutMs: { type: "number" },
        viewId: { type: "string" },
        ...WS,
      },
      additionalProperties: false,
    },
  },
  {
    name: "browser_lock",
    description: "Lock Browser Tab from human input during automation",
    inputSchema: { type: "object", properties: { viewId: { type: "string" }, ...WS }, additionalProperties: false },
  },
  {
    name: "browser_unlock",
    description: "Unlock Browser Tab",
    inputSchema: { type: "object", properties: { viewId: { type: "string" }, ...WS }, additionalProperties: false },
  },
  {
    name: "browser_resize",
    description: "Resize browser viewport",
    inputSchema: {
      type: "object",
      properties: {
        width: { type: "number" },
        height: { type: "number" },
        viewId: { type: "string" },
        ...WS,
      },
      required: ["width", "height"],
      additionalProperties: false,
    },
  },
  {
    name: "browser_screenshot",
    description: "Screenshot viewport (returns path + image data when available)",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, viewId: { type: "string" }, ...WS },
      additionalProperties: false,
    },
  },
  {
    name: "browser_inspect",
    description: "Under-the-hood DOM/meta/counts/links/inputs/body text",
    inputSchema: { type: "object", properties: { viewId: { type: "string" }, ...WS }, additionalProperties: false },
  },
  {
    name: "browser_console",
    description: "Console messages (DevTools Console)",
    inputSchema: { type: "object", properties: { viewId: { type: "string" }, ...WS }, additionalProperties: false },
  },
  {
    name: "browser_network",
    description: "Network requests (DevTools Network)",
    inputSchema: { type: "object", properties: { viewId: { type: "string" }, ...WS }, additionalProperties: false },
  },
  {
    name: "browser_evaluate",
    description: "Run JavaScript in page",
    inputSchema: {
      type: "object",
      properties: { script: { type: "string" }, viewId: { type: "string" }, ...WS },
      required: ["script"],
      additionalProperties: false,
    },
  },
  {
    name: "browser_tabs",
    description: "List Browser Tab view ids",
    inputSchema: { type: "object", properties: { ...WS }, additionalProperties: false },
  },
  {
    name: "browser_url",
    description: "Current URL",
    inputSchema: { type: "object", properties: { viewId: { type: "string" }, ...WS }, additionalProperties: false },
  },
  {
    name: "browser_title",
    description: "Current title",
    inputSchema: { type: "object", properties: { viewId: { type: "string" }, ...WS }, additionalProperties: false },
  },
  {
    name: "browser_back",
    description: "History back",
    inputSchema: { type: "object", properties: { viewId: { type: "string" }, ...WS }, additionalProperties: false },
  },
  {
    name: "browser_forward",
    description: "History forward",
    inputSchema: { type: "object", properties: { viewId: { type: "string" }, ...WS }, additionalProperties: false },
  },
  {
    name: "browser_reload",
    description: "Reload page",
    inputSchema: { type: "object", properties: { viewId: { type: "string" }, ...WS }, additionalProperties: false },
  },
];

function extractSnapshotText(data) {
  if (!data || typeof data !== "object") return null;
  if (data.result?.text && data.result.yaml !== undefined) return data.result.text;
  if (data.result?.snapshot?.text) return data.result.snapshot.text;
  if (data.result?.action?.snapshot?.text) return data.result.action.snapshot.text;
  return null;
}

function slimJson(data) {
  try {
    const clone = JSON.parse(JSON.stringify(data));
    const dropTree = (snap) => {
      if (snap && typeof snap === "object") delete snap.tree;
    };
    dropTree(clone.result);
    dropTree(clone.result?.snapshot);
    dropTree(clone.result?.action?.snapshot);
    if (clone.result?.snapshot?.dataUrl) delete clone.result.snapshot.dataUrl;
    return clone;
  } catch {
    return data;
  }
}

function toMcpContent(data) {
  // Prefer human snapshot text (open/nav/snapshot/interact+snap)
  const snapText = extractSnapshotText(data);
  if (snapText) {
    return {
      content: [{ type: "text", text: snapText }],
    };
  }
  // Screenshot image for vision models
  const r = data?.result;
  if (r?.dataUrl && typeof r.dataUrl === "string") {
    const m = r.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (m) {
      return {
        content: [
          { type: "text", text: JSON.stringify({ ok: true, savedPath: r.savedPath, filename: r.filename }) },
          { type: "image", data: m[2], mimeType: m[1] },
        ],
      };
    }
  }
  return {
    content: [{ type: "text", text: JSON.stringify(slimJson(data), null, 2) }],
  };
}

function snapArgs(args = {}) {
  const out = {};
  if (args.snapshot === true || args.snap === true || args.includeSnapshot === true) {
    out.snapshot = true;
    out.includeSnapshot = true;
  }
  if (args.waitNavigation === true || args.waitNav === true) {
    out.waitNavigation = true;
    if (args.timeoutMs != null) out.timeoutMs = args.timeoutMs;
  }
  return out;
}

async function callTool(name, args = {}) {
  const ws = args.workspace;
  switch (name) {
    case "browser_windows": {
      const instances = listInstances();
      const enriched = [];
      for (const inst of instances) {
        try {
          const r = await httpJson(
            "GET",
            "/whoami",
            null,
            inst.primaryName || inst.primaryPath,
            inst.port
          );
          enriched.push({
            port: inst.port,
            primaryName: r.workspace?.primaryName || inst.primaryName,
            primaryPath: r.workspace?.primaryPath || inst.primaryPath,
            version: r.version,
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
      return {
        ok: true,
        instances: enriched,
        cwd: process.cwd(),
        agent: {
          next: 'Call browser_resolve with workspace="<primaryName>", then pass that workspace on every browser_* tool.',
        },
      };
    }
    case "browser_resolve":
    case "browser_pin": {
      const target = resolveTarget(ws);
      const who = await httpJson("GET", "/whoami", null, ws);
      return buildPinPayload(target, who);
    }
    case "browser_status":
      return httpJson("GET", "/status", null, ws);
    case "browser_open":
      return act({ action: "open", url: args.url, interactive: true }, ws);
    case "browser_navigate":
      return act({
        action: "navigate",
        url: args.url,
        viewId: args.viewId,
        interactive: true,
      }, ws);
    case "browser_snapshot":
      return act({
        action: "snapshot",
        interactive: args.interactive !== false,
        viewId: args.viewId,
      }, ws);
    case "browser_click":
      return act({
        action: "click",
        ref: args.ref,
        selector: args.selector,
        viewId: args.viewId,
        ...snapArgs(args),
      }, ws);
    case "browser_dblclick":
      return act({
        action: "dblclick",
        ref: args.ref,
        selector: args.selector,
        viewId: args.viewId,
        ...snapArgs(args),
      }, ws);
    case "browser_rightclick":
      return act({
        action: "rightclick",
        ref: args.ref,
        selector: args.selector,
        viewId: args.viewId,
        ...snapArgs(args),
      }, ws);
    case "browser_type":
      return act({
        action: "type",
        ref: args.ref,
        selector: args.selector,
        text: args.text,
        viewId: args.viewId,
        ...snapArgs(args),
      }, ws);
    case "browser_fill":
      return act({
        action: "fill",
        ref: args.ref,
        selector: args.selector,
        text: args.value || args.text,
        value: args.value || args.text,
        viewId: args.viewId,
        ...snapArgs(args),
      }, ws);
    case "browser_scroll":
      return act({
        action: "scroll",
        ref: args.ref,
        selector: args.selector,
        x: args.x,
        y: args.y,
        top: args.top,
        left: args.left,
        viewId: args.viewId,
        ...snapArgs(args),
      }, ws);
    case "browser_select_option":
      return act({
        action: "select-option",
        ref: args.ref,
        selector: args.selector,
        value: args.value,
        label: args.label,
        index: args.index,
        viewId: args.viewId,
        ...snapArgs(args),
      }, ws);
    case "browser_hover":
      return act({
        action: "hover",
        ref: args.ref,
        viewId: args.viewId,
        ...snapArgs(args),
      }, ws);
    case "browser_press":
      return act({
        action: "press",
        key: args.key,
        viewId: args.viewId,
        ...snapArgs(args),
      }, ws);
    case "browser_wait":
      return act({
        action: "wait",
        urlContains: args.urlContains,
        host: args.host,
        text: args.text,
        ref: args.ref,
        selector: args.selector,
        timeoutMs: args.timeoutMs,
        viewId: args.viewId,
      }, ws);
    case "browser_lock":
      return act({ action: "lock", viewId: args.viewId }, ws);
    case "browser_unlock":
      return act({ action: "unlock", viewId: args.viewId }, ws);
    case "browser_resize":
      return act({
        action: "resize",
        width: args.width,
        height: args.height,
        viewId: args.viewId,
      }, ws);
    case "browser_screenshot":
      return act({ action: "screenshot", path: args.path, viewId: args.viewId }, ws);
    case "browser_inspect":
      return act({ action: "inspect", viewId: args.viewId }, ws);
    case "browser_console":
      return act({ action: "console", viewId: args.viewId }, ws);
    case "browser_network":
      return act({ action: "network", viewId: args.viewId }, ws);
    case "browser_evaluate":
      return act({ action: "evaluate", script: args.script, viewId: args.viewId }, ws);
    case "browser_tabs":
      return act({ action: "tabs" }, ws);
    case "browser_url":
      return act({ action: "url", viewId: args.viewId }, ws);
    case "browser_title":
      return act({ action: "title", viewId: args.viewId }, ws);
    case "browser_back":
      return act({ action: "back", viewId: args.viewId }, ws);
    case "browser_forward":
      return act({ action: "forward", viewId: args.viewId }, ws);
    case "browser_reload":
      return act({ action: "reload", viewId: args.viewId }, ws);
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}

function writeMessage(obj) {
  const json = JSON.stringify(obj);
  process.stdout.write(
    `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`
  );
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
        writeMessage({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "cursor-browser-cli", version: "1.2.0" },
          },
        });
      } else if (method === "notifications/initialized" || method === "initialized") {
        /* no-op */
      } else if (method === "tools/list") {
        writeMessage({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
      } else if (method === "tools/call") {
        try {
          const data = await callTool(params?.name, params?.arguments || {});
          writeMessage({ jsonrpc: "2.0", id, result: toMcpContent(data) });
        } catch (err) {
          writeMessage({
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: String(err.message || err) }],
              isError: true,
            },
          });
        }
      } else if (method === "ping") {
        writeMessage({ jsonrpc: "2.0", id, result: {} });
      } else if (id !== undefined) {
        writeMessage({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
      }
    } catch (err) {
      if (id !== undefined) {
        writeMessage({
          jsonrpc: "2.0",
          id,
          error: { code: -32603, message: String(err.message || err) },
        });
      }
    }
  }
});
process.stdin.on("end", () => process.exit(0));
