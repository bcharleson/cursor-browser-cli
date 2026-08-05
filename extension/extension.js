/* eslint-disable no-console */
/**
 * Cursor Browser CLI — extension host
 * Localhost HTTP API over cursor.browserView.* for CLI / MCP agents.
 */
const vscode = require("vscode");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const STATE_DIR = path.join(os.homedir(), ".cursor-browser-cli");
const INSTANCES_FILE = path.join(STATE_DIR, "instances.json");
const PORT_FILE = path.join(STATE_DIR, "port");
const LEGACY_PORT_FILE = path.join(os.homedir(), ".cursor-browser-bridge", "port");
const LOG_FILE = path.join(STATE_DIR, "bridge.log");
const BASE_PORT = 17373;
const MAX_PORT_TRIES = 32;
const VERSION = "1.0.0";

let server = null;
let statusBar = null;
let activePort = null;
let instanceId = null;
let SNAPSHOT_JS = null;

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(String).join(" ")}\n`;
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    /* ignore */
  }
  console.log("[cursor-browser-cli]", ...args);
}

function workspaceInfo() {
  const folders = vscode.workspace.workspaceFolders || [];
  const paths = folders.map((f) => f.uri.fsPath);
  const names = folders.map((f) => f.name);
  return {
    workspacePaths: paths,
    workspaceNames: names,
    primaryPath: paths[0] || null,
    primaryName: names[0] || null,
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
  for (const [id, inst] of Object.entries(map)) {
    if (
      inst.primaryPath &&
      info.primaryPath &&
      path.resolve(inst.primaryPath) === path.resolve(info.primaryPath) &&
      id !== instanceId
    ) {
      delete map[id];
    }
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
    version: VERSION,
    ...info,
  };
  writeInstances(map);
  fs.writeFileSync(PORT_FILE, String(port));
  // legacy path for any old tooling
  try {
    fs.mkdirSync(path.dirname(LEGACY_PORT_FILE), { recursive: true });
    fs.writeFileSync(LEGACY_PORT_FILE, String(port));
  } catch {
    /* ignore */
  }
  log("registered", instanceId, port, info.primaryName);
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
    return {
      ok: false,
      error: err && err.message ? err.message : String(err),
      command: id,
    };
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

async function listTabs() {
  return tryShapes("cursor.browserView.listTabs", [[], [{}]]);
}

function tabIdsFromList(tabsRes) {
  const r = tabsRes?.result !== undefined ? tabsRes.result : tabsRes;
  if (!r) return [];
  if (Array.isArray(r.tabs)) return r.tabs.filter(Boolean);
  if (Array.isArray(r)) return r.filter(Boolean);
  return [];
}

async function resolveViewId(requestedId) {
  const tabsRes = await listTabs();
  const raw = tabsRes?.result || {};
  const tabs = tabIdsFromList(tabsRes);
  const headless = new Set(raw.headlessTabs || []);
  if (requestedId && tabs.includes(requestedId)) return requestedId;
  const visible = tabs.find((t) => !headless.has(t));
  return visible || tabs[0] || null;
}

async function executeJavaScript(script, viewId) {
  return tryShapes("cursor.browserView.executeJavaScript", [
    [script],
    [script, viewId],
    [script, viewId, {}],
  ]);
}

async function navigate(url, viewId) {
  return tryShapes("cursor.browserView.navigate", [
    [url],
    [url, viewId],
    [url, viewId, { preserveFocus: true }],
  ]);
}

async function closeTab(viewId) {
  return tryShapes("cursor.browserView.closeTab", [
    [viewId],
    [viewId, {}],
    [{ viewId }],
  ]);
}

async function selectTab(viewId) {
  return tryShapes("cursor.browserView.selectTab", [[viewId], [viewId, {}]]);
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
    [],
  ]);
}

async function getConsoleLogs(viewId) {
  return tryShapes("cursor.browserView.getConsoleLogs", [
    [],
    [viewId],
    [viewId, {}],
  ]);
}

async function getNetworkRequests(viewId) {
  return tryShapes("cursor.browserView.getNetworkRequests", [
    [],
    [viewId],
    [viewId, {}],
  ]);
}

function loadSnapshotJS() {
  if (!SNAPSHOT_JS) {
    SNAPSHOT_JS = fs.readFileSync(path.join(__dirname, "snapshot.js"), "utf8");
  }
  return SNAPSHOT_JS;
}

function treeToYaml(node, indent = 0) {
  if (!node) return "";
  const pad = "  ".repeat(indent);
  let line = `${pad}- ${node.role || "element"}`;
  if (node.name) line += ` "${String(node.name).replace(/"/g, '\\"')}"`;
  if (node.ref) line += ` [ref=${node.ref}]`;
  if (node.level) line += ` [level=${node.level}]`;
  if (node.tag) line += ` <${node.tag}>`;
  if (node.states?.length) line += ` (${node.states.join(", ")})`;
  if (node.value !== undefined) line += ` value="${node.value}"`;
  if (node.placeholder) line += ` placeholder="${node.placeholder}"`;
  if (node.url) line += ` url="${node.url}"`;
  let result = line + "\n";
  if (node.children) {
    for (const child of node.children) result += treeToYaml(child, indent + 1);
  }
  return result;
}

const ELEMENT_FINDER_JS = `
function findElementByRef(ref) {
  var el = document.querySelector('[data-cursor-ref="' + ref + '"]');
  if (!el) return { element: null };
  var rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return { element: null };
  return { element: el };
}
function validateElement(el, ref, action) {
  if (!el) throw new Error('Element not found: ' + ref + '. Take a snapshot to get updated refs.');
  var style = window.getComputedStyle(el);
  if (style.display === 'none') throw new Error('Element ' + ref + ' is hidden (display:none).');
  if (style.visibility === 'hidden') throw new Error('Element ' + ref + ' is hidden (visibility:hidden).');
  if (el.disabled) throw new Error('Element ' + ref + ' is disabled.');
  if ((action === 'fill' || action === 'type') && el.readOnly) {
    throw new Error('Element ' + ref + ' is readonly.');
  }
}
`;

async function pageSnapshot(viewId, options = {}) {
  const vid = viewId || (await resolveViewId());
  if (!vid) return { ok: false, error: "No browser tab" };
  loadSnapshotJS();
  const opts = {
    interactive: options.interactive ?? false,
    maxDepth: options.maxDepth ?? 20,
    selector: options.selector ?? null,
  };
  const script = `
    ${loadSnapshotJS()}
    (function() {
      var options = ${JSON.stringify(opts)};
      var result = buildPageSnapshot(options);
      return {
        success: true,
        pageState: {
          url: window.location.href,
          title: document.title,
          snapshot: result.tree
        },
        stats: result.stats
      };
    })();
  `;
  const res = await executeJavaScript(script, vid);
  if (!res.ok) return res;
  const result = res.result;
  if (!result?.success) {
    return { ok: false, error: "Snapshot failed", result };
  }
  const yaml = treeToYaml(result.pageState.snapshot);
  const { url, title } = result.pageState;
  const stats = result.stats || {};
  let text = `Page: ${title}\nURL: ${url}\n`;
  text += `Refs: ${stats.totalRefs || 0} total, ${stats.interactiveRefs || 0} interactive\n\n`;
  text += yaml;
  return {
    ok: true,
    result: {
      text,
      yaml,
      url,
      title,
      viewId: vid,
      stats,
      tree: result.pageState.snapshot,
    },
  };
}

async function ensureSingleTab(url, opts = {}) {
  const forceNew = !!opts.newTab;
  const tabsRes = await listTabs();
  const ids = tabIdsFromList(tabsRes);

  if (!forceNew && ids.length > 0) {
    const viewId = ids[0];
    for (const extra of ids.slice(1)) await closeTab(extra);
    await selectTab(viewId);
    if (url) {
      await navigate(url, viewId);
      await sleep(300);
      if (opts.snapshot !== false) {
        const snap = await pageSnapshot(viewId, { interactive: !!opts.interactive });
        return {
          ok: true,
          result: {
            reusedTab: true,
            viewId,
            closedExtras: ids.slice(1),
            snapshot: snap.result,
          },
        };
      }
      return { ok: true, result: { reusedTab: true, viewId, closedExtras: ids.slice(1) } };
    }
    return { ok: true, result: { reusedTab: true, viewId, closedExtras: ids.slice(1) } };
  }

  const openAttempts = [
    ["workbench.action.focusOrOpenBrowserEditor"],
    ["workbench.action.openBrowserEditor"],
    ["composer.openBrowserTab"],
    ["cursor.browserView.newTab", url],
  ];
  for (const [id, ...args] of openAttempts) {
    const filtered = args.filter((a) => a !== undefined);
    const res = await cmd(id, ...filtered);
    if (res.ok) break;
  }
  await sleep(300);
  if (url) await navigate(url);
  await sleep(200);
  const viewId = await resolveViewId();
  if (opts.snapshot !== false) {
    const snap = await pageSnapshot(viewId, { interactive: !!opts.interactive });
    return {
      ok: true,
      result: { created: true, viewId, snapshot: snap.result },
    };
  }
  return { ok: true, result: { created: true, viewId } };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function clickByRef(ref, viewId) {
  const vid = viewId || (await resolveViewId());
  const script = `
    ${ELEMENT_FINDER_JS}
    (function() {
      var ref = ${JSON.stringify(ref)};
      var result = findElementByRef(ref);
      validateElement(result.element, ref, 'click');
      var el = result.element;
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      var rect = el.getBoundingClientRect();
      var x = rect.left + rect.width / 2;
      var y = rect.top + rect.height / 2;
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
      el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, clientX: x, clientY: y }));
      el.dispatchEvent(new MouseEvent('click',     { bubbles: true, clientX: x, clientY: y }));
      return { success: true, tag: el.tagName };
    })();
  `;
  return executeJavaScript(script, vid);
}

async function clickBySelector(selector, viewId) {
  const vid = viewId || (await resolveViewId());
  const script = `
    (function() {
      var el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false, error: 'selector not found' };
      el.scrollIntoView({ block: 'center' });
      el.focus({ preventScroll: true });
      el.click();
      var r = el.getBoundingClientRect();
      return { ok: true, tag: el.tagName, box: { x: r.x, y: r.y, w: r.width, h: r.height } };
    })();
  `;
  return executeJavaScript(script, vid);
}

async function typeByRef(ref, text, viewId, mode) {
  const vid = viewId || (await resolveViewId());
  const fill = mode === "fill";
  const script = fill
    ? `
    ${ELEMENT_FINDER_JS}
    (function() {
      var ref = ${JSON.stringify(ref)};
      var value = ${JSON.stringify(text || "")};
      var result = findElementByRef(ref);
      validateElement(result.element, ref, 'fill');
      var el = result.element;
      el.focus();
      var nativeSetter = Object.getOwnPropertyDescriptor(
        el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
        'value'
      )?.set;
      if (nativeSetter) nativeSetter.call(el, value);
      else if ('value' in el) el.value = value;
      else if (el.isContentEditable) el.textContent = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, value: el.value !== undefined ? el.value : el.textContent };
    })();
  `
    : `
    ${ELEMENT_FINDER_JS}
    (function() {
      var ref = ${JSON.stringify(ref)};
      var text = ${JSON.stringify(text || "")};
      var result = findElementByRef(ref);
      validateElement(result.element, ref, 'type');
      var el = result.element;
      el.focus();
      for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        el.dispatchEvent(new KeyboardEvent('keydown',  { key: ch, bubbles: true }));
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value += ch;
        else if (el.isContentEditable) document.execCommand('insertText', false, ch);
        el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true };
    })();
  `;
  return executeJavaScript(script, vid);
}

async function typeBySelector(selector, text, viewId) {
  const vid = viewId || (await resolveViewId());
  const script = `
    (function() {
      var el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false, error: 'not found' };
      el.focus({ preventScroll: true });
      var value = ${JSON.stringify(text || "")};
      var proto = Object.getOwnPropertyDescriptor(
        el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
        'value'
      );
      if (proto && proto.set) proto.set.call(el, value);
      else if ('value' in el) el.value = value;
      else if (el.isContentEditable) el.textContent = value;
      else return { ok: false, error: 'not typeable' };
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, value: el.value !== undefined ? el.value : el.textContent };
    })();
  `;
  return executeJavaScript(script, vid);
}

async function hoverByRef(ref, viewId) {
  const vid = viewId || (await resolveViewId());
  const script = `
    ${ELEMENT_FINDER_JS}
    (function() {
      var ref = ${JSON.stringify(ref)};
      var result = findElementByRef(ref);
      validateElement(result.element, ref, 'hover');
      var el = result.element;
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      var rect = el.getBoundingClientRect();
      var x = rect.left + rect.width / 2;
      var y = rect.top + rect.height / 2;
      el.dispatchEvent(new MouseEvent('mouseover',  { bubbles: true, clientX: x, clientY: y }));
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: x, clientY: y }));
      el.dispatchEvent(new MouseEvent('mousemove',  { bubbles: true, clientX: x, clientY: y }));
      return { success: true };
    })();
  `;
  return executeJavaScript(script, vid);
}

async function pressKey(key, viewId) {
  const vid = viewId || (await resolveViewId());
  const script = `
    (function() {
      var key = ${JSON.stringify(key)};
      var el = document.activeElement || document.body;
      var opts = { key: key, bubbles: true, cancelable: true, keyCode: key === 'Enter' ? 13 : 0 };
      el.dispatchEvent(new KeyboardEvent('keydown', opts));
      el.dispatchEvent(new KeyboardEvent('keypress', opts));
      el.dispatchEvent(new KeyboardEvent('keyup', opts));
      if (key === 'Enter') {
        var form = el.form || (el.closest && el.closest('form'));
        if (form) {
          if (typeof form.requestSubmit === 'function') form.requestSubmit();
          else form.submit();
          return { ok: true, submitted: true };
        }
        var btn = document.querySelector('input[name=btnK], button[type=submit], input[type=submit]');
        if (btn) { btn.click(); return { ok: true, clickedSubmit: true }; }
      }
      return { ok: true, dispatched: key };
    })();
  `;
  return executeJavaScript(script, vid);
}

async function setLocked(locked, viewId) {
  const vid = viewId || (await resolveViewId());
  if (!vid) return { ok: false, error: "No browser tab" };
  // setLocked(viewId, locked) or various shapes
  return tryShapes("cursor.browserView.setLocked", [
    [vid, locked],
    [vid, locked, {}],
    [{ viewId: vid, locked }],
  ]);
}

async function resize(width, height, viewId) {
  const vid = viewId || (await resolveViewId());
  return tryShapes("cursor.browserView.resize", [
    [{ viewId: vid, width, height }],
    [vid, { width, height }],
  ]);
}

async function inspectPage(viewId) {
  const vid = viewId || (await resolveViewId());
  const script = `
    (function() {
      const abs = (u) => { try { return new URL(u, location.href).href; } catch { return u; } };
      return {
        url: location.href,
        title: document.title,
        readyState: document.readyState,
        meta: {
          description: document.querySelector('meta[name="description"]')?.content || null,
          viewport: document.querySelector('meta[name="viewport"]')?.content || null,
        },
        counts: {
          links: document.querySelectorAll('a[href]').length,
          images: document.querySelectorAll('img').length,
          scripts: document.querySelectorAll('script').length,
          forms: document.querySelectorAll('form').length,
          inputs: document.querySelectorAll('input,textarea,select').length,
        },
        headings: [...document.querySelectorAll('h1,h2,h3')].slice(0, 30).map((h) => ({
          tag: h.tagName.toLowerCase(),
          text: (h.innerText || '').trim().slice(0, 120),
        })),
        links: [...document.querySelectorAll('a[href]')].slice(0, 40).map((a) => ({
          text: (a.innerText || '').trim().slice(0, 80),
          href: abs(a.getAttribute('href') || ''),
        })),
        inputs: [...document.querySelectorAll('input,textarea,select,button')].slice(0, 40).map((el) => ({
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type'),
          name: el.getAttribute('name'),
          id: el.id || null,
          placeholder: el.getAttribute('placeholder'),
        })),
        bodyText: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 4000),
        htmlLength: document.documentElement?.outerHTML?.length || 0,
      };
    })();
  `;
  return executeJavaScript(script, vid);
}

async function waitFor(body = {}) {
  const timeoutMs = Number(body.timeoutMs) || 30000;
  const deadline = Date.now() + timeoutMs;
  const viewId = body.viewId || (await resolveViewId());
  let last = {};

  while (Date.now() < deadline) {
    if (body.selector) {
      const r = await executeJavaScript(
        `(function(){ return !!document.querySelector(${JSON.stringify(body.selector)}); })();`,
        viewId
      );
      if (r.ok && r.result) {
        return { ok: true, matched: "selector", selector: body.selector, viewId };
      }
      last = { type: "selector", selector: body.selector };
    } else if (body.ref) {
      const snap = await pageSnapshot(viewId, { interactive: true });
      const text = snap.result?.text || "";
      if (text.includes(`[ref=${body.ref}]`)) {
        return {
          ok: true,
          matched: "ref",
          ref: body.ref,
          viewId,
          snapshot: text.slice(0, 800),
        };
      }
      last = { type: "ref", ref: body.ref };
    } else {
      const urlRes = await getURL(viewId);
      const url = urlRes.result || "";
      const titleRes = await getTitle(viewId);
      const title = titleRes.result || "";
      last = { url, title };
      if (body.host && url.includes(body.host) && url !== "about:blank") {
        return { ok: true, matched: "host", url, viewId };
      }
      if (body.urlContains && url.includes(body.urlContains)) {
        return { ok: true, matched: "urlContains", url, viewId };
      }
      if (body.text) {
        const snap = await pageSnapshot(viewId, { interactive: false });
        const text = snap.result?.text || "";
        if (text.includes(body.text)) {
          return { ok: true, matched: "text", url, viewId };
        }
      }
      if (!body.host && !body.urlContains && !body.text) {
        // default: wait until not about:blank
        if (url && url !== "about:blank") {
          return { ok: true, matched: "loaded", url, viewId };
        }
      }
    }
    await sleep(400);
  }
  return { ok: false, error: "wait-for timeout", last };
}

function instancePayload(extra = {}) {
  return {
    ok: true,
    port: activePort,
    version: VERSION,
    product: "cursor-browser-cli",
    instanceId,
    workspace: workspaceInfo(),
    ...extra,
  };
}

async function handleAction(body) {
  const action = body.action || body.tool || body.cmd;
  const url = body.url;
  const viewId = body.viewId || body.tabId;
  const ref = body.ref;
  const selector = body.selector || body.on;
  const text = body.text ?? body.value;
  const script = body.script || body.code || body.expression;

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
    case "probe": {
      const ids = [
        "cursor.browserView.listTabs",
        "cursor.browserView.navigate",
        "cursor.browserView.takeScreenshot",
        "cursor.browserView.executeJavaScript",
        "cursor.browserView.setLocked",
        "cursor.browserView.resize",
        "cursor.browserView.getConsoleLogs",
        "cursor.browserView.getNetworkRequests",
        "cursor.browserView.closeTab",
      ];
      const all = await vscode.commands.getCommands(true);
      const report = {};
      for (const id of ids) report[id] = all.includes(id);
      return { ok: true, result: report };
    }
    case "open":
      return ensureSingleTab(url, {
        newTab: !!body.newTab,
        snapshot: body.snapshot !== false,
        interactive: !!body.interactive,
      });
    case "navigate":
    case "nav": {
      if (!url) return { ok: false, error: "url required" };
      const vid = viewId || (await resolveViewId());
      const nav = await navigate(url, vid);
      if (nav.ok === false) return nav;
      await sleep(250);
      if (body.snapshot === false) return { ok: true, result: { viewId: vid } };
      const snap = await pageSnapshot(vid, { interactive: !!body.interactive });
      return {
        ok: true,
        result: { viewId: vid, snapshot: snap.result },
      };
    }
    case "tabs":
    case "listTabs":
      return listTabs();
    case "close":
    case "closeTab": {
      if (viewId) return closeTab(viewId);
      const ids = tabIdsFromList(await listTabs());
      if (ids.length <= 1) {
        return { ok: true, result: { closed: [], kept: ids[0] || null } };
      }
      const closed = [];
      for (const id of ids.slice(1)) {
        await closeTab(id);
        closed.push(id);
      }
      await selectTab(ids[0]);
      return { ok: true, result: { closed, kept: ids[0] } };
    }
    case "select":
    case "selectTab":
      if (!viewId) return { ok: false, error: "viewId required" };
      return selectTab(viewId);
    case "url":
      return getURL(viewId);
    case "title":
      return getTitle(viewId);
    case "snapshot":
    case "a11y":
    case "refs":
      return pageSnapshot(viewId, {
        interactive: body.interactive !== false,
        maxDepth: body.maxDepth,
        selector: body.selector,
      });
    case "screenshot":
    case "snap":
      return takeScreenshot({
        viewId: viewId || (await resolveViewId()),
        fullPage: !!body.fullPage,
      });
    case "click": {
      if (ref) return clickByRef(ref, viewId);
      if (selector) return clickBySelector(selector, viewId);
      return { ok: false, error: "click requires ref or selector" };
    }
    case "type": {
      if (ref) return typeByRef(ref, text, viewId, "type");
      if (selector) return typeBySelector(selector, text, viewId);
      return { ok: false, error: "type requires ref or selector + text" };
    }
    case "fill": {
      if (ref) return typeByRef(ref, text, viewId, "fill");
      if (selector) return typeBySelector(selector, text, viewId);
      return { ok: false, error: "fill requires ref or selector + value" };
    }
    case "hover": {
      if (!ref) return { ok: false, error: "hover requires ref (run snapshot first)" };
      return hoverByRef(ref, viewId);
    }
    case "press":
    case "key":
      if (!body.key) return { ok: false, error: "key required" };
      return pressKey(body.key, viewId);
    case "lock":
      return setLocked(true, viewId);
    case "unlock":
      return setLocked(false, viewId);
    case "resize":
      if (body.width == null || body.height == null) {
        return { ok: false, error: "width and height required" };
      }
      return resize(Number(body.width), Number(body.height), viewId);
    case "wait":
    case "wait-for":
    case "waitFor":
      return waitFor(body);
    case "inspect":
    case "dom":
      return inspectPage(viewId);
    case "console":
    case "logs":
      return getConsoleLogs(viewId);
    case "network":
      return getNetworkRequests(viewId);
    case "evaluate":
    case "eval":
      if (!script) return { ok: false, error: "script required" };
      return executeJavaScript(script, viewId || (await resolveViewId()));
    case "back":
      return tryShapes("cursor.browserView.goBack", [
        [],
        [viewId],
        [viewId, {}],
      ]);
    case "forward":
      return tryShapes("cursor.browserView.goForward", [
        [],
        [viewId],
        [viewId, {}],
      ]);
    case "reload":
      return tryShapes("cursor.browserView.reload", [
        [],
        [viewId],
        [viewId, {}],
      ]);
    case "cdp":
      return tryShapes("cursor.browserView.sendCDPCommand", [
        [body.method, body.params || {}],
        [body.method, body.params || {}, viewId],
      ]);
    default:
      return {
        ok: false,
        error: `Unknown action: ${action}`,
        available: [
          "status",
          "open",
          "navigate",
          "tabs",
          "close",
          "snapshot",
          "click",
          "type",
          "fill",
          "hover",
          "press",
          "lock",
          "unlock",
          "resize",
          "wait",
          "inspect",
          "console",
          "network",
          "screenshot",
          "evaluate",
          "back",
          "forward",
          "reload",
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
      } catch {
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
        if (req.method === "POST" && (u.pathname === "/action" || u.pathname === "/" || u.pathname === "/tool")) {
          const body = await readBody(req);
          // Support Vectorly-style { name, args }
          if (body.name && !body.action) {
            body.action = String(body.name).replace(/^browser_/, "").replace(/_/g, "-");
            // map browser_navigate -> navigate, etc.
            const map = {
              "browser-navigate": "navigate",
              "browser-snapshot": "snapshot",
              "browser-click": "click",
              "browser-type": "type",
              "browser-fill": "fill",
              "browser-hover": "hover",
              "browser-screenshot": "screenshot",
              "browser-lock": "lock",
              "browser-unlock": "unlock",
              "browser-tabs": "tabs",
              "browser-evaluate": "evaluate",
              "browser-console-messages": "console",
              "browser-network-requests": "network",
              "browser-press-key": "press",
              "browser-resize": "resize",
              "browser-navigate-back": "back",
              "browser-navigate-forward": "forward",
              "browser-reload": "reload",
              "browser-wait-for": "wait",
            };
            body.action = map[body.action] || body.action.replace(/^browser-/, "");
            Object.assign(body, body.args || {});
            if (body.args?.key) body.key = body.args.key;
          }
          const result = await handleAction(body);
          return sendJson(res, result.ok === false ? 400 : 200, result);
        }
        if (req.method === "POST" && u.pathname.startsWith("/")) {
          const body = await readBody(req);
          body.action = body.action || u.pathname.slice(1);
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
    s.on("error", reject);
    s.listen(port, "127.0.0.1", () => {
      activePort = port;
      registerInstance(port);
      log("listening", port);
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

function updateStatusBar(ok) {
  if (!statusBar) return;
  const ws = workspaceInfo().primaryName || "no-folder";
  if (ok && activePort) {
    statusBar.text = `$(terminal) ${ws} :${activePort}`;
    statusBar.tooltip = `cursor-browser-cli for ${ws}\n127.0.0.1:${activePort}`;
  } else {
    statusBar.text = `$(terminal) browser-cli off`;
  }
  statusBar.show();
}

async function restartServer() {
  await stopServer();
  const cfg = vscode.workspace.getConfiguration("cursorBrowserCli");
  // also accept old config key
  const old = vscode.workspace.getConfiguration("cursorBrowserBridge");
  const enabled = cfg.get("enabled", old.get("enabled", true));
  if (!enabled) {
    updateStatusBar(false);
    return;
  }
  const preferred = cfg.get("port", old.get("port", BASE_PORT));
  let lastErr;
  for (let p = preferred; p < preferred + MAX_PORT_TRIES; p++) {
    try {
      server = await startServer(p);
      updateStatusBar(true);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  vscode.window.showErrorMessage(
    `cursor-browser-cli failed to start: ${lastErr && lastErr.message}`
  );
  updateStatusBar(false);
}

async function activate(context) {
  log("activate", workspaceInfo());
  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBar.command = "cursorBrowserCli.status";
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand("cursorBrowserCli.status", async () => {
      const s = await handleAction({ action: "status" });
      vscode.window.showInformationMessage(
        `cursor-browser-cli :${s.port} ${s.workspace?.primaryName || ""}`
      );
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("cursorBrowserCli.restart", () =>
      restartServer()
    )
  );
  // legacy command ids
  context.subscriptions.push(
    vscode.commands.registerCommand("cursorBrowserBridge.status", () =>
      vscode.commands.executeCommand("cursorBrowserCli.status")
    )
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      if (activePort) registerInstance(activePort);
      updateStatusBar(!!activePort);
    })
  );

  await restartServer();
}

async function deactivate() {
  await stopServer();
}

module.exports = { activate, deactivate };
