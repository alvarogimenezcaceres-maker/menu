// Tests for the menu events endpoint:  node --test site/worker.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";
import { parseBatch, handleEvents, MAX_EVENTS, MAX_BODY } from "./events.js";

const HOST = "https://menu3d-demo.example.workers.dev";
const batch = (over = {}) => ({ v: 1, slug: "filigrana", visit: "abc123xyz0", src: "ig", dev: "m", hour: 21, dow: 5,
  events: [{ ev: "menu_view" }, { ev: "order_tap", n: 2, total: 101000, mode: "" }], ...over });
const sink = () => { const points = []; return { points, env: { MV_EVENTS: { writeDataPoint: p => points.push(p) } } }; };
const req = (body, headers = {}) => new Request(`${HOST}/e`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body),
  headers: { Origin: HOST, "User-Agent": "Mozilla/5.0 (Linux; Android 14) Chrome/140 Mobile", ...headers } });

test("valid batch becomes one data point per event with a stable layout", () => {
  const points = parseBatch(JSON.stringify(batch()), { city: "Asuncion" });
  assert.equal(points.length, 2);
  assert.deepEqual(points[1].indexes, ["filigrana"]);
  assert.deepEqual(points[1].blobs, ["order_tap", "ig", "", "", "", "", "m", "Asuncion", "abc123xyz0"]);
  assert.deepEqual(points[1].doubles, [101000, 2, 0, 21, 5, 0]);
});

test("unknown events, bad slugs and unknown sources are cleaned", () => {
  const points = parseBatch(JSON.stringify(batch({ src: "evil", events: [{ ev: "hack" }, { ev: "dish_view", dish: "../x" }, { ev: "dish_view", dish: "lomito" }] })));
  assert.equal(points.length, 1);
  assert.equal(points[0].blobs[1], "direct");
  assert.equal(points[0].blobs[2], "lomito");
});

test("search terms keep only letters", () => {
  const [p] = parseBatch(JSON.stringify(batch({ events: [{ ev: "search", q: "Pizza 4 quesos 0981123456" }] })));
  assert.equal(p.blobs[5], "pizza  quesos");
});

test("drops malformed, oversized, webdriver and empty batches", () => {
  assert.equal(parseBatch("not json"), null);
  assert.equal(parseBatch(JSON.stringify(batch({ v: 2 }))), null);
  assert.equal(parseBatch(JSON.stringify(batch({ slug: "Bad Slug" }))), null);
  assert.equal(parseBatch(JSON.stringify(batch({ webdriver: true }))), null);
  assert.equal(parseBatch(JSON.stringify(batch({ events: [] }))), null);
  assert.equal(parseBatch(JSON.stringify(batch({ events: Array(MAX_EVENTS + 1).fill({ ev: "menu_view" }) }))), null);
});

test("endpoint writes valid batches and always answers 204", async () => {
  const { points, env } = sink();
  const r = await handleEvents(req(batch()), env);
  assert.equal(r.status, 204);
  assert.equal(points.length, 2);
});

test("endpoint ignores other origins, bots, big bodies and GET", async () => {
  const { points, env } = sink();
  for (const r of [
    req(batch(), { Origin: "https://evil.example" }),
    req(batch(), { "User-Agent": "Googlebot/2.1" }),
    req(batch(), { "User-Agent": "Mozilla/5.0 HeadlessChrome/140" }),
    req("x".repeat(MAX_BODY + 1)),
    new Request(`${HOST}/e`, { method: "GET" }),
  ]) assert.equal((await handleEvents(r, env)).status, 204);
  assert.equal(points.length, 0);
});

test("missing Analytics Engine binding does not fail", async () => {
  assert.equal((await handleEvents(req(batch()), {})).status, 204);
});

test("other paths go to the static assets", async () => {
  const env = { ASSETS: { fetch: () => new Response("menu") } };
  const r = await worker.fetch(new Request(`${HOST}/filigrana/`), env);
  assert.equal(await r.text(), "menu");
});
