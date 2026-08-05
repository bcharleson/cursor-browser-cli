/* eslint-disable no-console */
/**
 * Cursor Browser Bridge
 * Exposes Cursor's internal browserView commands over localhost HTTP
 * so Grok Build / CLI / MCP clients can drive the Cursor Browser Tab.
 */
const vscode = require("vscode");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const STATE_DIR = path.join(os.homedir(), ".cursor-browser-bridge");
const PORT_FILE = path.join(STATE_DIR, "port");
const LOG_FILE = path.join(STATE_DIR, "bridge.log");

let server = null;
let statusBar = null;
let activePort = null;

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(String).join(" ")}\n`;
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    /* ignore */
  }
  console.log("[cursor-browser-bridge]", ...args);
}

async function cmd(id, ...args) {
  try {
    const result = await vscode.commands.executeCommand(id, ...args);
    return { ok: true, result };
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    log("cmd failed", id, message);
    return { ok: false, error: message, command: id };
  }
}

/**
 * Try multiple arg shapes because Cursor's command wrappers inject services
 * as the first parameter when registered internally, but executeCommand
 * only passes our args.
 */
async function tryShapes(command, shapes) {
  const errors = [];
  for (const shape of shapes) {
    const res = await cmd(command, ...shape);
    if (res.ok) return res;
    errors.push({ args: shape, error: res.error });
  }
  return { ok: false, error: "All arg shapes failed", command, errors };
}

async function ensureBrowserOpen(url) {
  // Prefer opening the Browser editor first
  const openAttempts = [
    ["workbench.action.openBrowserEditor"],
    ["workbench.action.focusOrOpenBrowserEditor"],
    ["workbench.action.newBrowserTab"],
    ["composer.openBrowserTab"],
    ["glass.openBrowserTab", url ? { url } : undefined],
    ["cursor.browserView.newTab", url],
    ["cursor.browserView.newTab", url, { preserveFocus: false }],
  ];
  for (const [id, ...args] of openAttempts) {
    const filtered = args.filter((a) => a !== undefined);
    const res = await cmd(id, ...filtered);
    if (res.ok) {
      log("opened via", id);
      break;
    }
  }
  if (url) {
    return navigate(url);
  }
  return { ok: true, result: { opened: true } };
}

async function navigate(url, viewId) {
  return tryShapes("cursor.browserView.navigate", [
    [url],
    [url, viewId],
    [url, viewId, {}],
    [{ url, viewId }],
  ]);
}

async function listTabs() {
  return tryShapes("cursor.browserView.listTabs", [[], [{}]]);
}

async function getURL(viewId) {
  return tryShapes("cursor.browserView.getURL", [
    [],
    [viewId],
    [viewId, {}],
  ]);
}

async function getTitle(viewId) {
  return tryShapes("cursor.browserView.getTitle", [
    [],
    [viewId],
    [viewId, {}],
  ]);
}

async function takeScreenshot(opts = {}) {
  const shapes = [
    [opts],
    [{ ...opts }],
    [opts.viewId, opts],
    [],
  ];
  return tryShapes("cursor.browserView.takeScreenshot", shapes);
}

async function executeJavaScript(script, viewId) {
  return tryShapes("cursor.browserView.executeJavaScript", [
    [script],
    [script, viewId],
    [script, viewId, {}],
  ]);
}

async function sendCDP(method, params = {}, viewId) {
  return tryShapes("cursor.browserView.sendCDPCommand", [
    [method, params],
    [method, params, viewId],
    [method, params, viewId, {}],
  ]);
}

async function goBack(viewId) {
  return tryShapes("cursor.browserView.goBack", [[], [viewId], [viewId, {}]]);
}

async function goForward(viewId) {
  return tryShapes("cursor.browserView.goForward", [[], [viewId], [viewId, {}]]);
}

async function reload(viewId) {
  return tryShapes("cursor.browserView.reload", [[], [viewId], [viewId, {}]]);
}

async function selectTab(viewId) {
  return tryShapes("cursor.browserView.selectTab", [[viewId], [viewId, {}]]);
}

async function handleAction(body) {
  const action = body.action || body.tool || body.cmd;
  const url = body.url;
  const viewId = body.viewId || body.tabId;
  const script = body.script || body.code || body.expression;
  const method = body.method;
  const params = body.params || {};

  switch (action) {
    case "status":
    case "health": {
      const tabs = await listTabs();
      return {
        ok: true,
        port: activePort,
        version: "0.1.0",
        tabs: tabs.ok ? tabs.result : null,
        tabsError: tabs.ok ? null : tabs.error,
      };
    }
    case "open":
      return ensureBrowserOpen(url);
    case "navigate":
    case "nav":
      if (!url) return { ok: false, error: "url required" };
      return navigate(url, viewId);
    case "tabs":
    case "listTabs":
      return listTabs();
    case "url":
    case "getURL":
      return getURL(viewId);
    case "title":
    case "getTitle":
      return getTitle(viewId);
    case "screenshot":
    case "snap":
    case "takeScreenshot":
      return takeScreenshot({
        viewId,
        fullPage: !!body.fullPage,
        ref: body.ref || body.element,
        path: body.path,
      });
    case "evaluate":
    case "eval":
    case "executeJavaScript":
      if (!script) return { ok: false, error: "script required" };
      return executeJavaScript(script, viewId);
    case "cdp":
    case "sendCDP":
      if (!method) return { ok: false, error: "method required" };
      return sendCDP(method, params, viewId);
    case "back":
      return goBack(viewId);
    case "forward":
      return goForward(viewId);
    case "reload":
      return reload(viewId);
    case "select":
    case "selectTab":
      if (!viewId) return { ok: false, error: "viewId required" };
      return selectTab(viewId);
    case "probe":
      // Discover which commands exist and respond
      return probeCommands();
    default:
      return {
        ok: false,
        error: `Unknown action: ${action}`,
        available: [
          "status",
          "open",
          "navigate",
          "tabs",
          "url",
          "title",
          "screenshot",
          "evaluate",
          "cdp",
          "back",
          "forward",
          "reload",
          "select",
          "probe",
        ],
      };
  }
}

async function probeCommands() {
  const ids = [
    "cursor.browserView.listTabs",
    "cursor.browserView.navigate",
    "cursor.browserView.takeScreenshot",
    "cursor.browserView.executeJavaScript",
    "cursor.browserView.getURL",
    "cursor.browserView.getTitle",
    "cursor.browserView.sendCDPCommand",
    "cursor.browserView.goBack",
    "cursor.browserView.goForward",
    "cursor.browserView.reload",
    "cursor.browserView.newTab",
    "cursor.browserView.selectTab",
    "workbench.action.openBrowserEditor",
    "workbench.action.focusOrOpenBrowserEditor",
    "workbench.action.newBrowserTab",
    "composer.openBrowserTab",
  ];
  const all = await vscode.commands.getCommands(true);
  const report = {};
  for (const id of ids) {
    report[id] = all.includes(id);
  }
  return { ok: true, result: report };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const s = http.createServer(async (req, res) => {
      // CORS preflight
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        return res.end();
      }

      try {
        const u = new URL(req.url || "/", `http://127.0.0.1:${port}`);

        if (req.method === "GET" && (u.pathname === "/" || u.pathname === "/health" || u.pathname === "/status")) {
          const result = await handleAction({ action: "status" });
          return sendJson(res, 200, result);
        }

        if (req.method === "GET" && u.pathname === "/probe") {
          const result = await handleAction({ action: "probe" });
          return sendJson(res, 200, result);
        }

        if (req.method === "POST" && (u.pathname === "/action" || u.pathname === "/")) {
          const body = await readBody(req);
          const result = await handleAction(body);
          return sendJson(res, result.ok ? 200 : 400, result);
        }

        // REST-ish shortcuts
        if (req.method === "POST" && u.pathname.startsWith("/")) {
          const action = u.pathname.slice(1);
          const body = await readBody(req);
          body.action = body.action || action;
          const result = await handleAction(body);
          return sendJson(res, result.ok ? 200 : 400, result);
        }

        sendJson(res, 404, { ok: false, error: "Not found" });
      } catch (err) {
        log("request error", err);
        sendJson(res, 500, { ok: false, error: String(err && err.message ? err.message : err) });
      }
    });

    s.on("error", (err) => {
      log("server error", err.message);
      reject(err);
    });

    s.listen(port, "127.0.0.1", () => {
      activePort = port;
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.writeFileSync(PORT_FILE, String(port));
      log("listening on 127.0.0.1:" + port);
      resolve(s);
    });
  });
}

async function stopServer() {
  if (!server) return;
  await new Promise((resolve) => server.close(() => resolve()));
  server = null;
  activePort = null;
  try {
    if (fs.existsSync(PORT_FILE)) fs.unlinkSync(PORT_FILE);
  } catch {
    /* ignore */
  }
}

async function restartServer(context) {
  await stopServer();
  const cfg = vscode.workspace.getConfiguration("cursorBrowserBridge");
  if (!cfg.get("enabled", true)) {
    updateStatusBar(false);
    return;
  }
  const port = cfg.get("port", 17373);
  try {
    server = await startServer(port);
    updateStatusBar(true);
    vscode.window.setStatusBarMessage(`Cursor Browser Bridge on :${port}`, 3000);
  } catch (err) {
    // Port in use — try next few
    let started = false;
    for (let p = port + 1; p < port + 10; p++) {
      try {
        server = await startServer(p);
        updateStatusBar(true);
        vscode.window.showWarningMessage(
          `Cursor Browser Bridge: port ${port} busy, using ${p}`
        );
        started = true;
        break;
      } catch {
        /* try next */
      }
    }
    if (!started) {
      log("failed to start", err);
      vscode.window.showErrorMessage(
        `Cursor Browser Bridge failed to start: ${err.message || err}`
      );
      updateStatusBar(false);
    }
  }
}

function updateStatusBar(ok) {
  if (!statusBar) return;
  if (ok && activePort) {
    statusBar.text = `$(globe) Browser Bridge :${activePort}`;
    statusBar.tooltip = `Cursor Browser Bridge listening on 127.0.0.1:${activePort}`;
    statusBar.backgroundColor = undefined;
  } else {
    statusBar.text = "$(globe) Browser Bridge off";
    statusBar.tooltip = "Cursor Browser Bridge is not running";
    statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  }
  statusBar.show();
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  log("activate");
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "cursorBrowserBridge.status";
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand("cursorBrowserBridge.status", async () => {
      const s = await handleAction({ action: "status" });
      const p = await handleAction({ action: "probe" });
      vscode.window.showInformationMessage(
        `Bridge port=${s.port || "off"} tabs=${JSON.stringify(s.tabs).slice(0, 120)}`
      );
      log("status", JSON.stringify(s));
      log("probe", JSON.stringify(p));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cursorBrowserBridge.restart", async () => {
      await restartServer(context);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("cursorBrowserBridge")) {
        await restartServer(context);
      }
    })
  );

  await restartServer(context);
}

async function deactivate() {
  await stopServer();
}

module.exports = { activate, deactivate };
