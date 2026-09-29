// node --test site/caja-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOrder, applyOp, can, isClosed, newRef, validRef, orderTotal, CajaError, wipePii } from "./caja-core.js";

const catalog = {
  ordering: { orderTypes: ["delivery", "pickup"], paymentMethods: ["efectivo", "transferencia"], deliveryZones: [{ name: "Centro", fee: 10000 }] },
  categories: [{ slug: "burgers", dishes: [
    { slug: "burger", name: "Burger", price: 40000, options: [{ group: "Tamaño", multiple: false, required: true, items: [{ name: "Simple", price: 0 }, { name: "Doble", price: 12000 }] }] },
    { slug: "papas", name: "Papas", price: 15000 },
    { slug: "agotada", name: "Agotada", price: 1000, soldOut: true },
  ] }],
};
const form = { type: "delivery", name: "Ana", address: "Palma 123", zone: 0, payment: "efectivo", cash: "150000" };
const order = (over = {}) => buildOrder({ ref: "AB2C", src: "wa", lines: [{ slug: "burger", picks: [[1]], note: "sin cebolla", n: 2 }], form, ...over }, catalog, 1000);
const throwsCode = (fn, code) => assert.throws(fn, e => e instanceof CajaError && e.code === code);

test("refs are 4 unambiguous characters", () => {
  for (let i = 0; i < 50; i++) assert.ok(validRef(newRef()));
  assert.equal(validRef("AB0C"), false); // 0 is left out
  assert.equal(validRef("abcd"), false);
});

test("prices come from the catalog, never from the phone", () => {
  const o = buildOrder({ ref: "AB2C", lines: [{ slug: "burger", picks: [[1]], n: 2, unit: 1, price: 1 }], form }, catalog);
  assert.equal(o.lines[0].unit, 52000);
  assert.equal(orderTotal(o), 2 * 52000 + 10000);
  assert.deepEqual(o.lines[0].extras, ["Doble"]);
  assert.equal(o.cash, 150000);
});

test("bad orders are refused: sold out, missing choice, missing name, unknown dish", () => {
  throwsCode(() => order({ lines: [{ slug: "agotada", picks: [], n: 1 }] }), "lines");
  throwsCode(() => order({ lines: [{ slug: "burger", picks: [[]], n: 1 }] }), "lines");
  throwsCode(() => order({ lines: [{ slug: "nope", picks: [], n: 1 }] }), "lines");
  throwsCode(() => order({ lines: [] }), "lines");
  throwsCode(() => order({ form: { ...form, name: " " } }), "form");
  throwsCode(() => order({ ref: "x" }), "ref");
});

test("manual orders may skip the address (the staff calls back)", () => {
  const o = order({ src: "manual", form: { ...form, address: "" } });
  assert.equal(o.src, "manual");
});

test("roles: the mozo accepts but does not charge; only the encargado cancels an accepted order", () => {
  assert.ok(can("mozo", "accept"));
  assert.equal(can("mozo", "paid"), false);
  assert.equal(can("cajero", "cancel"), false);
  const { order: prep } = applyOp(order(), "accept", {}, "mozo", catalog);
  throwsCode(() => applyOp(prep, "paid", { method: "efectivo" }, "mozo", catalog), "role");
  throwsCode(() => applyOp(prep, "cancel", { reason: "x" }, "cajero", catalog), "role");
  assert.equal(applyOp(prep, "cancel", { reason: "no contestó" }, "encargado", catalog).order.status, "cancelled");
});

test("cash delivery: closes only when the rider comes back with the money", () => {
  let o = order();
  o = applyOp(o, "accept", {}, "mozo", catalog).order;
  throwsCode(() => applyOp(o, "rendido", {}, "cajero", catalog), "state");
  o = applyOp(o, "street", { rider: "Hugo" }, "mozo", catalog).order;
  assert.equal(isClosed(o), false);
  const r = applyOp(o, "rendido", {}, "cajero", catalog, 5000);
  assert.equal(r.order.status, "delivered");
  assert.equal(r.order.closedAt, 5000);
  assert.match(r.text, /Rendido por Hugo · ₲ 114\.000/);
  throwsCode(() => applyOp(r.order, "accept", {}, "cajero", catalog), "closed");
});

test("transfer: paid can come before cooking ends; the sale closes when it is also delivered", () => {
  let o = order({ form: { ...form, payment: "transferencia", cash: "" } });
  throwsCode(() => applyOp(o, "paid", {}, "cajero", catalog), "state"); // accept first
  o = applyOp(o, "accept", {}, "cajero", catalog).order;
  o = applyOp(o, "paid", {}, "cajero", catalog).order;
  assert.equal(o.paid, true);
  assert.equal(isClosed(o), false);
  o = applyOp(o, "street", {}, "mozo", catalog).order;
  o = applyOp(o, "deliver", {}, "mozo", catalog).order;
  assert.ok(isClosed(o));
});

test("pickup: charging at the counter delivers it too", () => {
  let o = order({ form: { type: "pickup", name: "Ana", payment: "efectivo" } });
  o = applyOp(o, "accept", {}, "mozo", catalog).order;
  o = applyOp(o, "paid", { method: "efectivo", deliver: true }, "cajero", catalog).order;
  assert.ok(isClosed(o));
  throwsCode(() => applyOp(applyOp(order(), "accept", {}, "mozo", catalog).order, "paid", { deliver: true }, "cajero", catalog), "state"); // a delivery in the kitchen can't be handed over
});

test("adding items opens a new round and re-prices from the catalog", () => {
  let o = applyOp(order(), "accept", {}, "mozo", catalog).order;
  const r = applyOp(o, "addItems", { lines: [{ slug: "papas", picks: [], n: 1 }] }, "mozo", catalog);
  assert.equal(r.order.lines.length, 2);
  assert.equal(r.order.lines[1].round, 1);
  assert.equal(orderTotal(r.order), 2 * 52000 + 15000 + 10000);
  assert.match(r.text, /1 × Papas/);
});

test("reject needs a reason and only applies to new orders", () => {
  throwsCode(() => applyOp(order(), "reject", { reason: "" }, "mozo", catalog), "state");
  const prep = applyOp(order(), "accept", {}, "mozo", catalog).order;
  throwsCode(() => applyOp(prep, "reject", { reason: "x" }, "mozo", catalog), "state");
});

test("personal data can be wiped and the order still adds up", () => {
  const w = wipePii(order());
  assert.equal(w.address, "");
  assert.equal(w.name, "(borrado)");
  assert.equal(orderTotal(w), orderTotal(order()));
});
