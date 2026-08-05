#!/usr/bin/env node
/**
 * Install Cursor extension, skills, and print MCP hints.
 * Works for npm global/local installs and git clones.
 *
 * Usage:
 *   node scripts/setup.js
 *   cursor-browser setup
 *   npm run setup
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const EXT_DIR = path.join(ROOT, "extension");
const CLI = path.join(ROOT, "cli", "cursor-browser");
const MCP = path.join(ROOT, "mcp", "server.mjs");
const SKILL = path.join(ROOT, "skill", "SKILL.md");

function readVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(EXT_DIR, "package.json"), "utf8")
    );
    return pkg.version || "1.0.0";
  } catch {
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(ROOT, "package.json"), "utf8")
      );
      return pkg.version || "1.0.0";
    } catch {
      return "1.0.0";
    }
  }
}

function ensureExec(file) {
  try {
    if (fs.existsSync(file)) fs.chmodSync(file, 0o755);
  } catch {
    /* ignore on Windows / read-only */
  }
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function installExtension(version) {
  const targets = [
    path.join(
      os.homedir(),
      ".cursor",
      "extensions",
      `local.cursor-browser-cli-${version}`
    ),
    // Cursor may keep a previously loaded folder name; keep 1.0.0 in sync
    path.join(
      os.homedir(),
      ".cursor",
      "extensions",
      "local.cursor-browser-cli-1.0.0"
    ),
    // Legacy package names from renames
    path.join(
      os.homedir(),
      ".cursor",
      "extensions",
      "local.cursor-browser-bridge-0.3.0"
    ),
    path.join(
      os.homedir(),
      ".cursor",
      "extensions",
      "local.cursor-browser-bridge-0.2.0"
    ),
    path.join(
      os.homedir(),
      ".cursor",
      "extensions",
      "local.cursor-browser-bridge-0.1.0"
    ),
  ];

  const files = ["package.json", "extension.js", "snapshot.js"];
  for (const f of files) {
    const p = path.join(EXT_DIR, f);
    if (!fs.existsSync(p)) {
      throw new Error(`Missing extension file: ${p}`);
    }
  }

  for (const target of targets) {
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
    for (const f of files) {
      copyFile(path.join(EXT_DIR, f), path.join(target, f));
    }
    console.log(`    extension → ${target}`);
  }
}

function installSkills() {
  if (!fs.existsSync(SKILL)) {
    console.log("    skill: skipped (SKILL.md missing)");
    return;
  }
  const skillRoots = [
    path.join(os.homedir(), ".grok", "skills", "cursor-browser"),
    path.join(os.homedir(), ".claude", "skills", "cursor-browser"),
    path.join(os.homedir(), ".agents", "skills", "cursor-browser"),
  ];
  for (const root of skillRoots) {
    try {
      fs.mkdirSync(root, { recursive: true });
      copyFile(SKILL, path.join(root, "SKILL.md"));
      console.log(`    skill → ${path.join(root, "SKILL.md")}`);
    } catch (err) {
      console.log(`    skill skip ${root}: ${err.message}`);
    }
  }
}

function which(cmd) {
  try {
    const r = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], {
      encoding: "utf8",
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

function tryMcpHints() {
  if (which("grok")) {
    try {
      execSync("grok mcp remove cursor-browser", {
        stdio: "ignore",
        shell: true,
      });
    } catch {
      /* ignore */
    }
    try {
      const list = execSync("grok mcp list", {
        encoding: "utf8",
        shell: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
      if (/cursor-browser/i.test(list)) {
        console.log("    Grok MCP: already present");
      } else {
        execSync(`grok mcp add cursor-browser -- node "${MCP}"`, {
          stdio: "ignore",
          shell: true,
        });
        console.log("    Grok MCP: registered");
      }
    } catch {
      console.log(`    Tip: grok mcp add cursor-browser -- node "${MCP}"`);
    }
  }

  if (which("claude")) {
    console.log(`    Claude: claude mcp add cursor-browser -- node "${MCP}"`);
  }
}

function linkLocalBin() {
  // Helps git-clone installs; npm global already puts bin on PATH
  if (process.platform === "win32") return;
  const binDir = path.join(os.homedir(), ".local", "bin");
  const dest = path.join(binDir, "cursor-browser");
  try {
    fs.mkdirSync(binDir, { recursive: true });
    try {
      fs.unlinkSync(dest);
    } catch {
      /* ignore */
    }
    fs.symlinkSync(CLI, dest);
    console.log(`    CLI link: ${dest} → ${CLI}`);
  } catch (err) {
    console.log(`    CLI link skip: ${err.message}`);
  }
}

function main() {
  const skip =
    process.env.CURSOR_BROWSER_SKIP_SETUP === "1" ||
    process.env.CURSOR_BROWSER_SKIP_SETUP === "true";
  if (skip) {
    console.log("cursor-browser-cli setup skipped (CURSOR_BROWSER_SKIP_SETUP)");
    return;
  }

  const version = readVersion();
  const viaNpm = Boolean(process.env.npm_lifecycle_event);

  console.log(`==> cursor-browser-cli setup v${version}`);
  console.log(`    root: ${ROOT}`);

  ensureExec(CLI);
  ensureExec(MCP);
  ensureExec(path.join(ROOT, "scripts", "setup.js"));
  ensureExec(path.join(ROOT, "scripts", "install.sh"));

  if (viaNpm) {
    console.log("    CLI: npm exposes `cursor-browser` and `cursor-browser-mcp` on PATH");
  } else {
    linkLocalBin();
  }

  installExtension(version);
  installSkills();
  tryMcpHints();

  console.log("");
  console.log("Done.");
  console.log(
    "  1. Reload Cursor windows (Cmd/Ctrl+Shift+P → Developer: Reload Window)"
  );
  console.log("  2. cursor-browser windows");
  console.log(
    "  3. cursor-browser --workspace <project> open https://example.com"
  );
  console.log("  4. cursor-browser --workspace <project> snapshot");
  console.log("");
  console.log(`MCP: cursor-browser-mcp`);
  console.log(`     or: node ${MCP}`);
  console.log("");
}

function run() {
  try {
    main();
  } catch (err) {
    console.error("cursor-browser-cli setup failed:", err.message || err);
    console.error("Run again: cursor-browser setup");
    // Do not fail npm install hard — user can re-run setup
    if (process.env.npm_lifecycle_event === "postinstall") {
      process.exit(0);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  run();
} else {
  module.exports = { main: run, setup: run };
}
