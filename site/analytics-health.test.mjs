// node --test site/analytics-health.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { handleAnalyticsHealth } from "./worker.js";

test("analytics health: reports last day and row count", async () => {
  const env = { MV_D1: { prepare: () => ({ first: async () => ({ lastDay: "2026-11-14", rows: 42 }) }) } };
  const body = await (await handleAnalyticsHealth(env)).json();
  assert.deepEqual(body, { ok: true, lastDay: "2026-11-14", rows: 42 });
});

test("analytics health: empty table", async () => {
  const env = { MV_D1: { prepare: () => ({ first: async () => ({ lastDay: null, rows: 0 }) }) } };
  assert.deepEqual(await (await handleAnalyticsHealth(env)).json(), { ok: true, lastDay: null, rows: 0 });
});

test("analytics health: no D1 binding", async () => {
  assert.equal((await (await handleAnalyticsHealth({})).json()).ok, false);
});
