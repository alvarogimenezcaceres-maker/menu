// Tests for the daily aggregation cron:  node --test site/aggregate.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { pyWindow, aggregate } from "./aggregate.js";

test("pyWindow: yesterday PY = UTC day-1 03:00 → UTC day 03:00", () => {
  // Cron fires 2026-11-14 09:00 UTC → PY yesterday = 2026-11-13
  const { from, to, day } = pyWindow(new Date("2026-11-14T09:00:00.000Z").getTime());
  assert.equal(day, "2026-11-13");
  assert.equal(from, "2026-11-13 03:00:00");
  assert.equal(to, "2026-11-14 03:00:00");
});

test("pyWindow: midnight-UTC edge — 2026-01-01 09:00 UTC → PY yesterday = 2026-12-31", () => {
  const { from, to, day } = pyWindow(new Date("2026-01-01T09:00:00.000Z").getTime());
  assert.equal(day, "2025-12-31");
  assert.equal(from, "2025-12-31 03:00:00");
  assert.equal(to, "2026-01-01 03:00:00");
});

test("aggregate: skips when secrets or D1 are missing", async () => {
  const event = { scheduledTime: Date.now() };
  // No throw, just returns
  await assert.doesNotReject(aggregate(event, {}));
  await assert.doesNotReject(aggregate(event, { CF_ACCOUNT_ID: "x" }));
});

test("aggregate: empty AE result writes nothing to D1", async () => {
  const batches = [];
  const event = { scheduledTime: new Date("2026-11-14T09:00:00.000Z").getTime() };
  const env = {
    CF_ACCOUNT_ID: "acct",
    CF_ANALYTICS_TOKEN: "tok",
    MV_D1: { batch: stmts => batches.push(stmts), prepare: () => ({ bind: (...args) => ({ __args: args }) }) },
  };
  // Patch fetch to return empty rows
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: [] }) });
  await aggregate(event, env);
  globalThis.fetch = orig;
  assert.equal(batches.length, 0);
});

test("aggregate: AE rows batch-upserted into D1 with correct day label", async () => {
  const batches = [];
  const event = { scheduledTime: new Date("2026-11-14T09:00:00.000Z").getTime() };
  const env = {
    CF_ACCOUNT_ID: "acct",
    CF_ANALYTICS_TOKEN: "tok",
    MV_D1: {
      batch: stmts => { batches.push(stmts); return Promise.resolve(); },
      prepare: () => ({ bind: (...args) => ({ __args: args }) }),
    },
  };
  const fakeRows = [
    { slug: "filigrana", ev: "menu_view", dish: "", hour: "21", src: "qr", city: "Asuncion", count: "150", sum_total: "0" },
    { slug: "filigrana", ev: "order_tap", dish: "lomito", hour: "21", src: "qr", city: "Asuncion", count: "5", sum_total: "475000" },
  ];
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: fakeRows }) });
  await aggregate(event, env);
  globalThis.fetch = orig;

  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 2);
  // First row: day = 2026-11-13, slug = filigrana, ...
  assert.equal(batches[0][0].__args[0], "2026-11-13");
  assert.equal(batches[0][0].__args[1], "filigrana");
  assert.equal(batches[0][0].__args[7], 150);
  // Second row order_tap with sum_total
  assert.equal(batches[0][1].__args[8], 475000);
});
