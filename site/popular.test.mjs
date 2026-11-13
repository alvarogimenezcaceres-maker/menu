// Tests for GET /api/<slug>/popular:  node --test site/popular.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { daysAgo, queryPopular, handlePopular } from "./popular.js";

test("daysAgo: returns a date 7 days before the given timestamp", () => {
  const ts = new Date("2026-11-13T12:00:00.000Z").getTime();
  assert.equal(daysAgo(ts, 7), "2026-11-06");
});

test("daysAgo: year rollover", () => {
  const ts = new Date("2026-01-05T12:00:00.000Z").getTime();
  assert.equal(daysAgo(ts, 7), "2025-12-29");
});

test("queryPopular: returns empty array when MV_D1 is missing", async () => {
  const result = await queryPopular({}, "filigrana", "2026-11-06");
  assert.deepEqual(result, []);
});

test("queryPopular: returns dish slugs sorted by total", async () => {
  const fakeRows = [
    { dish: "lomito-completo", total: 50 },
    { dish: "pizza-muzzarella", total: 30 },
  ];
  const env = {
    MV_D1: { prepare: () => ({ bind: () => ({ all: async () => ({ results: fakeRows }) }) }) },
  };
  const result = await queryPopular(env, "filigrana", "2026-11-06");
  assert.deepEqual(result, ["lomito-completo", "pizza-muzzarella"]);
});

test("queryPopular: returns empty array when no results", async () => {
  const env = {
    MV_D1: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }) },
  };
  const result = await queryPopular(env, "filigrana", "2026-11-06");
  assert.deepEqual(result, []);
});

test("handlePopular: returns JSON with dishes array", async () => {
  const fakeRows = [{ dish: "lomito", total: 10 }];
  const env = {
    MV_D1: { prepare: () => ({ bind: () => ({ all: async () => ({ results: fakeRows }) }) }) },
  };
  const req = new Request("https://menu.mesaverso.app/api/filigrana/popular");
  const res = await handlePopular(req, env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "application/json");
  assert.ok(res.headers.get("Cache-Control").includes("max-age=3600"));
  const body = await res.json();
  assert.deepEqual(body.dishes, ["lomito"]);
});

test("handlePopular: returns empty dishes for invalid slug", async () => {
  const req = new Request("https://menu.mesaverso.app/api/INVALID SLUG/popular");
  const res = await handlePopular(req, {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.dishes, []);
});

test("handlePopular: OPTIONS returns 204", async () => {
  const req = new Request("https://menu.mesaverso.app/api/filigrana/popular", { method: "OPTIONS" });
  const res = await handlePopular(req, {});
  assert.equal(res.status, 204);
});
