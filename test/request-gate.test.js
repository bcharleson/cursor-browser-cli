"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const gate = require("../extension/request-gate");

const NOW = Date.parse("2026-10-19T15:38:09.327Z");

test("a fresh unseen token is handled once", () => {
  assert.equal(
    gate.decideRequest({ token: "t1", lastToken: null, ageMs: 1000 }),
    "handle"
  );
  assert.equal(
    gate.decideRequest({ token: "t1", lastToken: "t1", ageMs: 1000 }),
    "ignore"
  );
});

test("a leftover reload file is dropped instead of reloading", () => {
  const raw = '{"at":"2026-09-24T16:31:08.320Z","pid":53032,"kind":"reload"}\n';
  const age = gate.requestAgeMs(raw, Date.parse("2026-09-24T16:31:08.320Z"), NOW);
  assert.ok(age > 20 * 24 * 60 * 60 * 1000);
  assert.equal(gate.readTokenFromRaw(raw, 0), "2026-09-24T16:31:08.320Z");
  assert.equal(
    gate.decideRequest({
      token: gate.readTokenFromRaw(raw, 0),
      lastToken: null,
      ageMs: age,
    }),
    "drop"
  );
});

test("age prefers the JSON at field over mtime", () => {
  const raw = JSON.stringify({
    at: new Date(NOW - 5000).toISOString(),
    token: "abc",
  });
  assert.equal(gate.requestAgeMs(raw, NOW, NOW), 5000);
  assert.equal(gate.readTokenFromRaw(raw, NOW), "abc");
});

test("a token timestamp more than a minute ahead is dropped", () => {
  assert.equal(
    gate.decideRequest({ token: "future", lastToken: null, ageMs: -120000 }),
    "drop"
  );
  assert.equal(
    gate.decideRequest({ token: "skew", lastToken: null, ageMs: -1000 }),
    "handle"
  );
});

test("missing age never reloads", () => {
  assert.equal(
    gate.decideRequest({ token: "x", lastToken: null, ageMs: null }),
    "drop"
  );
});

test("seen reload tokens are per workspace and survive a host restart", () => {
  const first = gate.rememberReload({}, "/tmp/goatfit", "reload-1", NOW);
  const both = gate.rememberReload(first, null, "reload-2", NOW);
  assert.equal(gate.rememberedReload(both, "/tmp/goatfit", NOW), "reload-1");
  assert.equal(gate.rememberedReload(both, null, NOW), "reload-2");
  assert.equal(
    gate.rememberedReload(both, "/tmp/goatfit", NOW + gate.SEEN_RELOAD_TTL_MS + 1),
    null
  );
});

test("rememberReload drops expired entries", () => {
  const stale = {
    "/old": { token: "old", at: NOW - gate.SEEN_RELOAD_TTL_MS - 1 },
  };
  const next = gate.rememberReload(stale, "/tmp/goatfit", "reload-1", NOW);
  assert.equal(next["/old"], undefined);
  assert.equal(next[gate.seenReloadKey("/tmp/goatfit")].token, "reload-1");
});
