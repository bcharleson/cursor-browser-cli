/* eslint-disable no-console */
/**
 * Cursor Browser Bridge
 * Per-window HTTP bridge so Grok/CLI can target the Browser Tab in the
 * same Cursor project/window as the caller's workspace (cwd).
 */
const vscode = require("vscode");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const STATE_DIR = path.join(os.homedir(), ".cursor-browser-bridge");
const INSTANCES_FILE = path.join(STATE_DIR, "instances.json");
const PORT_FILE = path.join(STATE_DIR, "port"); // legacy: last-writer (prefer instances.json)
const LOG_FILE = path.join(STATE_DIR, "bridge.log");
const BASE_PORT = 17373;
const MAX_PORT_TRIES = 32;

let server = null;
let statusBar = null;
let activePort = null;
let instanceId = null;

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

function workspaceInfo() {
  const folders = vscode.workspace.workspaceFolders || [];
  const paths = folders.map((f) => f.uri.fsPath);
  const names = folders.map((f) => f.name);
  // Prefer first folder name; also expose basenames for matching
  const primary = paths[0] || null;
  const primaryName = names[0] || null;
  return {
    workspacePaths: paths,
    workspaceNames: names,
    primaryPath: primary,
    primaryName: primaryName,
    basenames: paths.map((p) => path.basename(p)),
  };
}

function readInstances() {
  try {
    if (!fs.existsSync(INSTANCES_FILE)) return {};
    return JSON.parse(fs.readFileSync(INSTANCES_FILE, "utf8") || "{}");
  } catch {
    return {};
  }
}

function writeInstances(map) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = INSTANCES_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(map, null, 2));
  fs.renameSync(tmp, INSTANCES_FILE);
}

function registerInstance(port) {
  const info = workspaceInfo();
  instanceId =
    instanceId ||
    `w-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const map = readInstances();
  // Drop stale entries for same primary path (reloads)
  for (const [id, inst] of Object.entries(map)) {
    if (
      inst.primaryPath &&
      info.primaryPath &&
      path.resolve(inst.primaryPath) === path.resolve(info.primaryPath) &&
      id !== instanceId
    ) {
      delete map[id];
    }
    // Drop dead ports: if pid gone
    if (inst.pid && inst.pid !== process.pid) {
      try {
        process.kill(inst.pid, 0);
      } catch {
        delete map[id];
      }
    }
  }
  map[instanceId] = {
    id: instanceId,
    port,
    pid: process.pid,
    updatedAt: new Date().toISOString(),
    ...info,
  };
  writeInstances(map);
  // Keep legacy port file for tools that don't multi-route yet — only if single instance
  // Prefer writing the most recently updated; CLI should use instances.json
  fs.writeFileSync(PORT_FILE, String(port));
  log("registered", instanceId, "port", port, "workspace", info.primaryName || info.primaryPath);
}

function unregisterInstance() {
  if (!instanceId) return;
  try {
    const map = readInstances();
    delete map[instanceId];
    writeInstances(map);
  } catch {
    /* ignore */
  }
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
  // Open browser IN THIS window only (commands run in this extension host)
  const openAttempts = [
    ["workbench.action.focusOrOpenBrowserEditor"],
    ["workbench.action.openBrowserEditor"],
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
    // Small delay so the view exists
    await new Promise((r) => setTimeout(r, 150));
    return navigate(url);
  }
  return { ok: true, result: { opened: true, workspace: workspaceInfo() } };
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
  return tryShapes("cursor.browserView.getURL", [[], [viewId], [viewId, {}]]);
}

async function getTitle(viewId) {
  return tryShapes("cursor.browserView.getTitle", [[], [viewId], [viewId, {}]]);
}

async function takeScreenshot(opts = {}) {
  return tryShapes("cursor.browserView.takeScreenshot", [
    [opts],
    [{ ...opts }],
    [opts.viewId, opts],
    [],
  ]);
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
  for (const id of ids) report[id] = all.includes(id);
  return { ok: true, result: report };
}

function instancePayload(extra = {}) {
  return {
    ok: true,
    port: activePort,
    version: "0.2.0",
    instanceId,
    workspace: workspaceInfo(),
    ...extra,
  };
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
      return instancePayload({
        tabs: tabs.ok ? tabs.result : null,
        tabsError: tabs.ok ? null : tabs.error,
      });
    }
    case "whoami":
    case "workspace":
      return instancePayload();
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
      return probeCommands();
    default:
      return {
        ok: false,
        error: `Unknown action: ${action}`,
        available: [
          "status",
          "whoami",
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

        if (
          req.method === "GET" &&
          (u.pathname === "/" ||
            u.pathname === "/health" ||
            u.pathname === "/status" ||
            u.pathname === "/whoami")
        ) {
          const result = await handleAction({
            action: u.pathname === "/whoami" ? "whoami" : "status",
          });
          return sendJson(res, 200, result);
        }

        if (req.method === "GET" && u.pathname === "/probe") {
          return sendJson(res, 200, await handleAction({ action: "probe" }));
        }

        if (req.method === "POST" && (u.pathname === "/action" || u.pathname === "/")) {
          const body = await readBody(req);
          const result = await handleAction(body);
          return sendJson(res, result.ok === false ? 400 : 200, result);
        }

        if (req.method === "POST" && u.pathname.startsWith("/")) {
          const action = u.pathname.slice(1);
          const body = await readBody(req);
          body.action = body.action || action;
          const result = await handleAction(body);
          return sendJson(res, result.ok === false ? 400 : 200, result);
        }

        sendJson(res, 404, { ok: false, error: "Not found" });
      } catch (err) {
        log("request error", err);
        sendJson(res, 500, {
          ok: false,
          error: String(err && err.message ? err.message : err),
        });
      }
    });

    s.on("error", (err) => reject(err));
    s.listen(port, "127.0.0.1", () => {
      activePort = port;
      registerInstance(port);
      log("listening on 127.0.0.1:" + port);
      resolve(s);
    });
  });
}

async function stopServer() {
  unregisterInstance();
  if (!server) return;
  await new Promise((resolve) => server.close(() => resolve()));
  server = null;
  activePort = null;
}

async function restartServer(context) {
  await stopServer();
  const cfg = vscode.workspace.getConfiguration("cursorBrowserBridge");
  if (!cfg.get("enabled", true)) {
    updateStatusBar(false);
    return;
  }
  const preferred = cfg.get("port", BASE_PORT);
  let lastErr;
  for (let p = preferred; p < preferred + MAX_PORT_TRIES; p++) {
    try {
      server = await startServer(p);
      updateStatusBar(true);
      const ws = workspaceInfo().primaryName || workspaceInfo().primaryPath || "workspace";
      vscode.window.setStatusBarMessage(
        `Browser Bridge :${p} → ${ws}`,
        4000
      );
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  log("failed to start", lastErr);
  vscode.window.showErrorMessage(
    `Cursor Browser Bridge failed to start: ${lastErr && lastErr.message ? lastErr.message : lastErr}`
  );
  updateStatusBar(false);
}

function updateStatusBar(ok) {
  if (!statusBar) return;
  const ws = workspaceInfo().primaryName || "no-folder";
  if (ok && activePort) {
    statusBar.text = `$(globe) ${ws} :${activePort}`;
    statusBar.tooltip = `Cursor Browser Bridge for ${ws}\n127.0.0.1:${activePort}\n${workspaceInfo().primaryPath || ""}`;
    statusBar.backgroundColor = undefined;
  } else {
    statusBar.text = `$(globe) Bridge off (${ws})`;
    statusBar.tooltip = "Cursor Browser Bridge is not running in this window";
    statusBar.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
  }
  statusBar.show();
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  log("activate", workspaceInfo());
  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBar.command = "cursorBrowserBridge.status";
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand("cursorBrowserBridge.status", async () => {
      const s = await handleAction({ action: "status" });
      const msg = `Bridge :${s.port} workspace=${s.workspace && s.workspace.primaryName} tabs=${JSON.stringify(s.tabs).slice(0, 80)}`;
      vscode.window.showInformationMessage(msg);
      log("status", JSON.stringify(s));
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

  // Re-register if folders change
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      if (activePort) registerInstance(activePort);
      updateStatusBar(!!activePort);
    })
  );

  await restartServer(context);
}

async function deactivate() {
  await stopServer();
}

module.exports = { activate, deactivate };
