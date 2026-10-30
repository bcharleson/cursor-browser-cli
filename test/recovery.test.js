"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

// Execute the real recovery paths with isolated state and no Cursor processes.
function harness({ bridges = [], failWait = false } = {}) {
  const cli = path.resolve(__dirname, "../cli/cursor-browser");
  const events = [];
  const context = {
    require: createRequire(cli),
    __dirname: path.dirname(cli),
    console: { log() {}, error() {} },
    process: {
      env: {},
      exit: (code) => events.push(["exit", code]),
      kill: () => assert.fail("Recovery must never terminate a process"),
    },
    setTimeout: (fn) => fn(),
    events,
    bridges,
    failWait,
  };
  vm.createContext(context);
  const source = fs.readFileSync(cli, "utf8").replace(/\nmain\(\);\s*$/, "");
  vm.runInContext(source + `
    clearAgedRequestFiles = () => [];
    clearStaleState = () => events.push(["clear-state"]);
    clearRequestFiles = () => events.push(["clear-requests"]);
    cursorRunning = () => true;
    writeRestartRequest = (kind) => {
      events.push(["request", kind]);
      return { file: kind, token: kind + "-token" };
    };
    waitForBridge = async () => {
      if (failWait) throw new Error("probe failed");
      return bridges;
    };
    probeLiveVersions = async () => bridges;
    print = () => {};
    runSetup = () => events.push(["setup"]);
    runDoctorSilent = async () => ({
      portsListening173xx: bridges.map(b => b.port), bridges, diagnosis: []
    });
    globalThis.recover = runRecover;
    globalThis.ensure = runEnsure;
  `, context);
  return { context, events };
}

test("failed ordinary recovery never requests a window reload", async () => {
  const { context, events } = harness();
  const result = await context.recover({ noExit: true, quiet: true });
  assert.equal(result.ok, false);
  assert.ok(events.some(e => e[0] === "request" && e[1] === "restart"));
  assert.ok(!events.some(e => e[0] === "request" && e[1] === "reload"));
  assert.ok(result.steps.includes("reload-deferred-until-explicit-request"));
  assert.equal(events.at(-1)[0], "clear-requests");
});

test("an explicit reload never escalates to killing extension hosts", async () => {
  const { context, events } = harness();
  const result = await context.recover({ forceReload: true, noExit: true, quiet: true });
  assert.equal(result.ok, false);
  assert.equal(events.filter(e => e[0] === "request" && e[1] === "reload").length, 1);
  assert.ok(!result.steps.includes("recycle-user-extension-hosts"));
  assert.equal(events.at(-1)[0], "clear-requests");
});

test("ensure leaves live older extension hosts running", async () => {
  const { context, events } = harness({
    bridges: [{ port: 17373, version: "1.3.3", live: true }],
  });
  const result = await context.ensure();
  assert.equal(result.ok, true); // The bridge remains usable while agents run.
  assert.equal(result.versionsOk, false);
  assert.equal(result.pendingActivation, true);
  assert.ok(result.steps.includes("version-update-awaits-window-reload"));
  assert.ok(!events.some(e => e[0] === "request"));
});

test("recovery clears its request files even when probing throws", async () => {
  const { context, events } = harness({ failWait: true });
  await assert.rejects(context.recover({ noExit: true, quiet: true }), /probe failed/);
  assert.equal(events.at(-1)[0], "clear-requests");
});
