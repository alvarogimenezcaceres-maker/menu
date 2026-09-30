// node --test site/caja-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOrder, applyOp, can, isClosed, newRef, validRef, orderTotal, CajaError, wipePii, openTable, addRound, addDiner, applyTableOp, priceLines, DINER_COLORS, addPending, dinerView, requestBill, shiftSummary } from "./caja-core.js";

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

/* ---------- mesas ---------- */
const priced = raw => priceLines(raw, catalog);

test("a table opens from the diner's order, with the first color", () => {
  const t = openTable({ ref: "MESA", table: 5, lines: priced([{ slug: "burger", picks: [[0]], n: 1 }]), dinerId: "diner-aaaaaaaa", by: "Pedro" }, 1000);
  assert.equal(t.kind, "table");
  assert.equal(t.status, "open");
  assert.deepEqual(t.diners, [{ id: "diner-aaaaaaaa", color: "azul" }]);
  assert.equal(t.lines[0].diner, "azul");
  assert.equal(t.rounds, 1);
  assert.equal(orderTotal(t), 40000);
  throwsCode(() => openTable({ ref: "X", table: 0 }), "table");
});

test("each new diner gets the next free color; the same phone keeps its color", () => {
  let t = openTable({ ref: "MESA", table: 2, lines: [], dinerId: null });
  assert.equal(t.rounds, 0);
  const a = addRound(t, priced([{ slug: "papas", picks: [], n: 1 }]), "diner-aaaaaaaa"); t = a.session;
  const b = addRound(t, priced([{ slug: "papas", picks: [], n: 2 }]), "diner-bbbbbbbb"); t = b.session;
  const again = addRound(t, priced([{ slug: "papas", picks: [], n: 1 }]), "diner-aaaaaaaa"); t = again.session;
  assert.deepEqual([a.color, b.color, again.color], ["azul", "verde", "azul"]);
  assert.deepEqual(t.lines.map(l => [l.round, l.diner]), [[0, "azul"], [1, "verde"], [2, "azul"]]);
  assert.equal(addDiner(t, "bad id").color, null); // invalid ids get no color (staff lines)
  assert.equal(DINER_COLORS.length, 8);
});

test("table: the mozo adds items but only the cajero charges; charging closes it", () => {
  let t = openTable({ ref: "MESA", table: 3, lines: priced([{ slug: "papas", picks: [], n: 2 }]), dinerId: "diner-aaaaaaaa" });
  t = applyTableOp(t, "addItems", { lines: [{ slug: "burger", picks: [[1]], n: 1 }] }, "mozo", catalog).order;
  assert.equal(t.lines[1].diner, null);
  assert.equal(orderTotal(t), 2 * 15000 + 52000);
  throwsCode(() => applyTableOp(t, "charge", { method: "efectivo" }, "mozo", catalog), "role");
  throwsCode(() => applyTableOp(t, "charge", {}, "cajero", catalog), "state");
  const r = applyTableOp(t, "charge", { method: "tarjeta" }, "cajero", catalog, 9000);
  assert.ok(isClosed(r.order));
  assert.equal(r.order.closedAt, 9000);
  throwsCode(() => applyTableOp(r.order, "addItems", { lines: [{ slug: "papas", picks: [], n: 1 }] }, "mozo", catalog), "closed");
});

test("table: an empty table can't be charged, only cancelled by the encargado", () => {
  const t = openTable({ ref: "MESA", table: 4, lines: [] });
  throwsCode(() => applyTableOp(t, "charge", { method: "efectivo" }, "cajero", catalog), "state");
  throwsCode(() => applyTableOp(t, "cancel", { reason: "se fueron" }, "cajero", catalog), "role");
  assert.equal(applyTableOp(t, "cancel", { reason: "se fueron" }, "encargado", catalog).order.status, "cancelled");
});

test("diners order from the phone: it waits, then the mozo accepts it into their color", () => {
  let t = openTable({ ref: "MESA", table: 5, lines: priced([{ slug: "papas", picks: [], n: 1 }]), dinerId: "diner-aaaaaaaa", joinToken: "tok" });
  const r = addPending(t, "diner-bbbbbbbb", priced([{ slug: "burger", picks: [[0]], n: 2 }]), "p1", 5);
  t = r.session;
  assert.equal(r.color, "verde");
  assert.equal(orderTotal(t), 15000); // pending doesn't count yet
  throwsCode(() => applyTableOp(t, "charge", { method: "efectivo" }, "cajero", catalog), "state"); // accept or reject first
  const a = applyTableOp(t, "acceptRound", { id: "p1" }, "mozo", catalog);
  assert.equal(a.order.pending.length, 0);
  assert.equal(orderTotal(a.order), 15000 + 80000);
  assert.deepEqual(a.order.lines.map(l => l.diner), ["azul", "verde"]);
  assert.match(a.text, /Pedido de Verde aceptado: 2 × Burger/);
  throwsCode(() => applyTableOp(a.order, "acceptRound", { id: "p1" }, "mozo", catalog), "state"); // already handled
});

test("rejecting a pending order drops it; a phone can't flood the table", () => {
  let t = openTable({ ref: "MESA", table: 6, lines: [] });
  t = addPending(t, "diner-aaaaaaaa", priced([{ slug: "papas", picks: [], n: 1 }]), "p1").session;
  t = addPending(t, "diner-aaaaaaaa", priced([{ slug: "papas", picks: [], n: 1 }]), "p2").session;
  throwsCode(() => addPending(t, "diner-aaaaaaaa", priced([{ slug: "papas", picks: [], n: 1 }]), "p3"), "locked");
  throwsCode(() => addPending(t, "x", priced([{ slug: "papas", picks: [], n: 1 }]), "p4"), "diner");
  const r = applyTableOp(t, "rejectRound", { id: "p1", reason: "no es de esta mesa" }, "cajero", catalog);
  assert.equal(r.order.pending.length, 1);
  assert.equal(r.order.lines.length, 0);
});

test("the diner's view hides the join token and other phones' ids", () => {
  let t = openTable({ ref: "MESA", table: 7, lines: priced([{ slug: "papas", picks: [], n: 1 }]), dinerId: "diner-aaaaaaaa", joinToken: "secret-token" });
  t = addPending(t, "diner-bbbbbbbb", priced([{ slug: "papas", picks: [], n: 1 }]), "p1").session;
  const v = dinerView(t, "diner-bbbbbbbb");
  const text = JSON.stringify(v);
  assert.equal(text.includes("secret-token"), false);
  assert.equal(text.includes("diner-aaaaaaaa"), false);
  assert.equal(v.me, "verde");
  assert.deepEqual(v.colors, ["azul", "verde"]);
  assert.equal(v.pending[0].mine, true);
  assert.equal(dinerView(t, "diner-aaaaaaaa").pending[0].mine, false);
});

/* ---------- dividir y cobrar por persona ---------- */
test("a diner asks for the bill split by consumption; the cajera charges each part and the table closes", () => {
  let t = openTable({ ref: "MESA", table: 8, lines: priced([{ slug: "burger", picks: [[0]], n: 1 }]), dinerId: "diner-aaaaaaaa" });
  t = addPending(t, "diner-bbbbbbbb", priced([{ slug: "papas", picks: [], n: 2 }]), "p1").session;
  throwsCode(() => requestBill(t, { mode: "consumo" }, "diner-aaaaaaaa"), "state"); // pending first
  t = applyTableOp(t, "acceptRound", { id: "p1" }, "mozo", catalog).order;
  t = requestBill(t, { mode: "consumo", tipMode: "10" }, "diner-bbbbbbbb", 7);
  assert.equal(t.bill.by, "verde");
  assert.deepEqual(t.bill.parts.map(p => [p.key, p.amount, p.tip, p.pay]), [["azul", 40000, 4000, 44000], ["verde", 30000, 3000, 33000]]);
  assert.equal(dinerView(t, "diner-aaaaaaaa").bill.parts[0].paid, false);
  throwsCode(() => applyTableOp(t, "payPart", { key: "azul", method: "efectivo" }, "mozo", catalog), "role");
  let r = applyTableOp(t, "payPart", { key: "azul", method: "efectivo" }, "cajero", catalog);
  assert.equal(isClosed(r.order), false);
  assert.match(r.text, /Pagó Azul · Efectivo · ₲ 44\.000/);
  throwsCode(() => applyTableOp(r.order, "payPart", { key: "azul", method: "efectivo" }, "cajero", catalog), "state");
  r = applyTableOp(r.order, "payPart", { key: "verde", method: "tarjeta" }, "cajero", catalog, 9);
  assert.ok(isClosed(r.order));
  assert.equal(r.order.payMethod, "mixto");
  assert.match(r.text, /mesa cerrada/);
});

test("the split is dropped when the account changes", () => {
  let t = openTable({ ref: "MESA", table: 9, lines: priced([{ slug: "papas", picks: [], n: 1 }]), dinerId: "diner-aaaaaaaa" });
  t = requestBill(t, { mode: "iguales", n: 2 }, "diner-aaaaaaaa");
  assert.ok(t.bill);
  t = applyTableOp(t, "addItems", { lines: [{ slug: "papas", picks: [], n: 1 }] }, "mozo", catalog).order;
  assert.equal(t.bill, null);
  throwsCode(() => applyTableOp(t, "payPart", { key: "p1", method: "efectivo" }, "cajero", catalog), "state");
  throwsCode(() => requestBill(t, { mode: "libres", amounts: { azul: 1 } }, "diner-aaaaaaaa"), "split");
});

/* ---------- turno ---------- */
test("shift summary: by payment method with split parts, tips apart, cancellations and what is pending", () => {
  const cash = { ...applyOp(applyOp(applyOp(order(), "accept", {}, "mozo", catalog).order, "street", { rider: "Hugo" }, "mozo", catalog).order, "rendido", {}, "cajero", catalog, 2000).order };
  let t = openTable({ ref: "MESA", table: 1, lines: priced([{ slug: "burger", picks: [[0]], n: 1 }]), dinerId: "diner-aaaaaaaa" });
  t = addPending(t, "diner-bbbbbbbb", priced([{ slug: "papas", picks: [], n: 2 }]), "p1").session;
  t = applyTableOp(t, "acceptRound", { id: "p1" }, "mozo", catalog).order;
  t = requestBill(t, { mode: "consumo", tipMode: "10" }, "diner-aaaaaaaa");
  t = applyTableOp(t, "payPart", { key: "azul", method: "qr" }, "cajero", catalog, 3000).order;
  t = applyTableOp(t, "payPart", { key: "verde", method: "efectivo" }, "cajero", catalog, 3000).order;
  const gone = applyOp(order({ ref: "CANC" }), "reject", { reason: "fuera de zona" }, "mozo", catalog, 2500).order;
  const street = applyOp(applyOp(order({ ref: "CALL" }), "accept", {}, "mozo", catalog).order, "street", { rider: "Luis" }, "mozo", catalog).order;
  const openT = openTable({ ref: "OPEN", table: 2, lines: priced([{ slug: "papas", picks: [], n: 1 }]) });
  const old = { ...cash, ref: "OLD1", closedAt: 500 }; // before the shift
  const s = shiftSummary([cash, t, gone, street, openT, old], 1000, 9000);
  assert.equal(s.count, 2);
  assert.deepEqual(s.byMethod, { efectivo: 114000 + 30000, qr: 40000 });
  assert.equal(s.sales, 114000 + 70000);
  assert.equal(s.tips, 7000);
  assert.equal(s.fees, 10000);
  assert.deepEqual(s.cancelled.map(c => [c.label, c.reason]), [["#MV-CANC", "fuera de zona"]]);
  assert.deepEqual(s.pending.street, { Luis: 114000 });
  assert.equal(s.pending.openTables, 1);
  assert.equal(s.pending.openTablesTotal, 15000);
});

/* ---------- cocina ---------- */
test("kitchen: each round is a comanda; Listo, undo, and the waiter serves it", () => {
  let t = openTable({ ref: "MESA", table: 3, lines: priced([{ slug: "papas", picks: [], n: 1 }]), dinerId: "diner-aaaaaaaa" }, 100);
  t = applyTableOp(t, "addItems", { lines: [{ slug: "burger", picks: [[0]], n: 1 }] }, "mozo", catalog).order;
  assert.deepEqual(Object.keys(t.kitchen), ["0", "1"]);
  assert.equal(t.kitchen[1].status, "pending");
  throwsCode(() => applyTableOp(t, "served", { round: 1 }, "mozo", catalog), "state"); // not ready yet
  throwsCode(() => applyTableOp(t, "kitchenReady", { round: 9 }, "cocina", catalog), "state");
  t = applyTableOp(t, "kitchenReady", { round: 1 }, "cocina", catalog, 500).order;
  assert.equal(t.kitchen[1].status, "ready");
  assert.equal(t.kitchen[1].readyAt, 500);
  t = applyTableOp(t, "kitchenUndo", { round: 1 }, "cocina", catalog).order;
  assert.equal(t.kitchen[1].status, "pending");
  t = applyTableOp(t, "kitchenReady", { round: 1 }, "cocina", catalog).order;
  throwsCode(() => applyTableOp(t, "served", { round: 1 }, "cocina", catalog), "role"); // the kitchen doesn't serve
  const r = applyTableOp(t, "served", { round: 1 }, "mozo", catalog);
  assert.equal(r.order.kitchen[1].status, "served");
  assert.match(r.text, /Ronda 2 entregada/);
});

test("kitchen role: marks orders ready but can't accept, add, charge or cancel", () => {
  assert.equal(can("cocina", "accept"), false);
  assert.equal(can("cocina", "addItems"), false);
  assert.equal(can("cocina", "paid"), false);
  assert.equal(can("cocina", "take"), false);
  assert.ok(can("cocina", "ready"));
  let o = applyOp(order(), "accept", {}, "mozo", catalog).order;
  throwsCode(() => applyOp(order(), "accept", {}, "cocina", catalog), "role");
  o = applyOp(o, "ready", {}, "cocina", catalog, 700).order; // a delivery can be ready in the kitchen
  assert.equal(o.status, "ready");
  o = applyOp(o, "kitchenUndo", {}, "cocina", catalog).order;
  assert.equal(o.status, "prep");
  o = applyOp(o, "ready", {}, "cocina", catalog).order;
  o = applyOp(o, "street", { rider: "Hugo" }, "mozo", catalog).order; // then it leaves with the rider
  assert.equal(o.status, "street");
  throwsCode(() => applyOp(o, "kitchenUndo", {}, "cocina", catalog), "state");
});
