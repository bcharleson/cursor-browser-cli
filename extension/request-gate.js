"use strict";

/**
 * Reload/restart request policy shared by the extension and the CLI.
 *
 * A reload token must be remembered on disk. workbench.action.reloadWindow
 * restarts the extension host, so an in-memory "already handled" flag is gone
 * on the way back up and the same file reloads the window forever.
 *
 * The CLI waits at most ~30s and then deletes the file. Anything older than
 * REQUEST_MAX_AGE_MS is a leftover (killed recover, old CLI) and must be dropped.
 */

const REQUEST_MAX_AGE_MS = 60 * 1000;
const SEEN_RELOAD_TTL_MS = 10 * 60 * 1000;

function requestAgeMs(raw, mtimeMs, now = Date.now()) {
  if (raw != null && String(raw).trim()) {
    try {
      const parsed = JSON.parse(String(raw));
      if (parsed && parsed.at) {
        const at = Date.parse(parsed.at);
        if (Number.isFinite(at)) return now - at;
      }
    } catch {
      /* plain token — fall through to mtime */
    }
  }
  if (mtimeMs == null || !Number.isFinite(Number(mtimeMs))) return null;
  return now - Number(mtimeMs);
}

function readTokenFromRaw(raw, mtimeMs) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) {
    if (mtimeMs == null || !Number.isFinite(Number(mtimeMs))) return null;
    return `mtime:${mtimeMs}`;
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed && (parsed.token || parsed.at)) return String(parsed.token || parsed.at);
  } catch {
    /* plain token */
  }
  return text;
}

/**
 * @returns {"handle"|"ignore"|"drop"}
 * drop: stale or unreadable age — caller deletes the file
 * ignore: this workspace already handled this token
 */
function decideRequest({ token, lastToken, ageMs, maxAgeMs = REQUEST_MAX_AGE_MS }) {
  if (!token) return "ignore";
  if (ageMs == null || ageMs > maxAgeMs || ageMs < -maxAgeMs) return "drop";
  if (token === lastToken) return "ignore";
  return "handle";
}

function seenReloadKey(primaryPath) {
  if (!primaryPath) return "__no_folder__";
  return require("path").resolve(primaryPath);
}

function rememberReload(map, primaryPath, token, now = Date.now()) {
  const next = {};
  for (const [key, entry] of Object.entries(map || {})) {
    if (
      entry &&
      entry.token &&
      entry.at &&
      now - entry.at <= SEEN_RELOAD_TTL_MS
    ) {
      next[key] = entry;
    }
  }
  next[seenReloadKey(primaryPath)] = { token, at: now };
  return next;
}

function rememberedReload(map, primaryPath, now = Date.now()) {
  const entry = (map || {})[seenReloadKey(primaryPath)];
  if (!entry || !entry.token) return null;
  if (!entry.at || now - entry.at > SEEN_RELOAD_TTL_MS) return null;
  return String(entry.token);
}

module.exports = {
  REQUEST_MAX_AGE_MS,
  SEEN_RELOAD_TTL_MS,
  requestAgeMs,
  readTokenFromRaw,
  decideRequest,
  seenReloadKey,
  rememberReload,
  rememberedReload,
};
