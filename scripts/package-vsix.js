#!/usr/bin/env node
/**
 * Pack extension/ into a VSIX at the repo root.
 * Stages README + LICENSE beside the extension so the gallery page is complete.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const EXT = path.join(ROOT, "extension");
const stage = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-browser-vsix-"));

for (const file of ["package.json", "extension.js", "snapshot.js", "icon.png", ".vscodeignore"]) {
  fs.copyFileSync(path.join(EXT, file), path.join(stage, file));
}
fs.copyFileSync(path.join(ROOT, "LICENSE"), path.join(stage, "LICENSE"));
fs.writeFileSync(
  path.join(stage, "README.md"),
  fs
    .readFileSync(path.join(ROOT, "README.md"), "utf8")
    .replaceAll("](extension/icon.png)", "](icon.png)")
);

const pkg = JSON.parse(fs.readFileSync(path.join(EXT, "package.json"), "utf8"));
const out = path.join(ROOT, `${pkg.name}-${pkg.version}.vsix`);
const localVsce = path.join(ROOT, "node_modules", ".bin", "vsce");
const vsce = fs.existsSync(localVsce) ? localVsce : null;

const cmd = vsce || "npx";
const args = vsce
  ? ["package", "--out", out, "--no-dependencies", "--no-rewrite-relative-links"]
  : ["--yes", "@vscode/vsce", "package", "--out", out, "--no-dependencies", "--no-rewrite-relative-links"];

const result = spawnSync(cmd, args, { cwd: stage, stdio: "inherit" });
fs.rmSync(stage, { recursive: true, force: true });
if (result.status !== 0) process.exit(result.status || 1);
console.log(`vsix → ${out}`);
