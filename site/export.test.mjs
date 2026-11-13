// Tests for the monthly R2 export:  node --test site/export.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { prevPyMonth, exportMonth } from "./export.js";

test("prevPyMonth: mid-year — fires 2026-07-01 10:00 UTC → exports 2026-06", () => {
  assert.equal(prevPyMonth(new Date("2026-07-01T10:00:00.000Z").getTime()), "2026-06");
});

test("prevPyMonth: year rollover — fires 2026-01-01 10:00 UTC → exports 2025-12", () => {
  assert.equal(prevPyMonth(new Date("2026-01-01T10:00:00.000Z").getTime()), "2025-12");
});

test("exportMonth: skips when bindings are missing", async () => {
  const event = { scheduledTime: Date.now() };
  await assert.doesNotReject(exportMonth(event, {}));
  await assert.doesNotReject(exportMonth(event, { MV_D1: {} }));
  await assert.doesNotReject(exportMonth(event, { MV_R2: {} }));
});

test("exportMonth: queries D1 with correct month prefix and writes to R2", async () => {
  const event = { scheduledTime: new Date("2026-07-01T10:00:00.000Z").getTime() };
  const fakeRows = [
    { day: "2026-06-15", slug: "filigrana", ev: "menu_view", dish: "", hour: 20, src: "qr", city: "Asuncion", count: 42, sum_total: 0 },
  ];
  let queriedLike = null;
  let putKey = null;
  let putBody = null;

  const env = {
    MV_D1: {
      prepare: (sql) => ({
        bind: (like) => { queriedLike = like; return { all: async () => ({ results: fakeRows }) }; },
      }),
    },
    MV_R2: {
      put: async (key, body) => { putKey = key; putBody = body; },
    },
  };

  await exportMonth(event, env);

  assert.equal(queriedLike, "2026-06-%");
  assert.equal(putKey, "analytics/2026-06.json");
  const parsed = JSON.parse(putBody);
  assert.equal(parsed.month, "2026-06");
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].slug, "filigrana");
});

test("exportMonth: empty month still writes an R2 file with empty rows", async () => {
  const event = { scheduledTime: new Date("2026-07-01T10:00:00.000Z").getTime() };
  let putBody = null;
  const env = {
    MV_D1: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }) },
    MV_R2: { put: async (_, body) => { putBody = body; } },
  };
  await exportMonth(event, env);
  const parsed = JSON.parse(putBody);
  assert.equal(parsed.rows.length, 0);
});
