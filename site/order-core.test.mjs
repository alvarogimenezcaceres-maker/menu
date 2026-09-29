// node --test site/order-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {};
vm.runInNewContext(readFileSync(new URL("./order-core.js", import.meta.url), "utf8") + "\nthis.OrderCore = OrderCore;", ctx);
const C = ctx.OrderCore;
const plain = v => JSON.parse(JSON.stringify(v)); // objects from the vm context have another Object prototype

const pizza = {
  slug: "pizza", name: "Pizza", price: 50000,
  options: C.normalizeOptions([
    { group: "Tamaño", items: [{ name: "Mediana" }, { name: "Grande", price: 15000 }] },
    { group: "Extras", multiple: true, items: [{ name: "Cheddar", price: 5000 }, { name: "Panceta", price: 7000 }] },
  ]),
};
const bySlug = { pizza };

test("old seed choices become free items; single groups are required, multiple ones optional", () => {
  const o = plain(C.normalizeOptions([{ group: "Sabor", multiple: false, choices: ["Frutilla", "Piña"] }, { group: "Acomp.", multiple: true, choices: ["Papas"] }]));
  assert.deepEqual(o, [
    { group: "Sabor", multiple: false, required: true, items: [{ name: "Frutilla", price: 0 }, { name: "Piña", price: 0 }] },
    { group: "Acomp.", multiple: true, required: false, items: [{ name: "Papas", price: 0 }] },
  ]);
});

test("price adds the chosen items; required groups are enforced; bad indexes are dropped", () => {
  const picks = C.cleanPicks(pizza, [[1, 0], [1, 0, 9]]);
  assert.deepEqual(plain(picks), [[0], [0, 1]]); // single group keeps one, multiple keeps valid ones sorted
  assert.equal(C.unitPrice(pizza, [[1], [0, 1]]), 50000 + 15000 + 5000 + 7000);
  assert.deepEqual(plain(C.missingGroups(pizza, [[], []])), [0]);
  assert.deepEqual(plain(C.describePicks(pizza, [[1], [0]])), ["Grande", "Cheddar"]);
});

test("saved lines survive only while they still match the menu", () => {
  const ok = { slug: "pizza", picks: [[1], []], note: "sin cebolla", n: 2 };
  const out = plain(C.restoreLines([ok, { slug: "gone", picks: [], n: 1 }, { slug: "pizza", picks: [[5], []], n: 1 }, { slug: "pizza", picks: [[], []], n: 1 }], bySlug));
  assert.equal(out.length, 1);
  assert.equal(out[0].k, C.lineKey("pizza", [[1], []], "sin cebolla"));
  assert.deepEqual(plain(C.restoreLines([ok], { pizza: { ...pizza, soldOut: true } })), []);
});

// 2026-10-03 is a Saturday; Asunción is UTC-3
const at = (iso) => new Date(iso);
const hours = [{ days: ["fri", "sat"], open: "18:00", close: "02:00" }, { days: ["sun"], open: "11:30", close: "15:00" }];

test("opening hours use Asunción time and handle closing after midnight", () => {
  assert.equal(C.openState([], at("2026-10-03T12:00:00Z")), null);
  assert.deepEqual(plain(C.openState(hours, at("2026-10-03T22:00:00Z"))), { open: true, until: "02:00" }); // Sat 19:00
  assert.deepEqual(plain(C.openState(hours, at("2026-10-04T04:30:00Z"))), { open: true, until: "02:00" }); // Sun 01:30, from Saturday
  assert.deepEqual(plain(C.openState(hours, at("2026-10-04T06:00:00Z"))), { open: false, next: "hoy a las 11:30" }); // Sun 03:00
  assert.deepEqual(plain(C.openState(hours, at("2026-10-04T19:00:00Z"))), { open: false, next: "el viernes a las 18:00" }); // Sun 16:00
  assert.deepEqual(plain(C.openState(hours, at("2026-10-02T20:00:00Z"))), { open: false, next: "hoy a las 18:00" }); // Fri 17:00
  assert.deepEqual(plain(C.openState(hours, at("2026-10-01T20:00:00Z"))), { open: false, next: "mañana a las 18:00" }); // Thu 17:00
});

test("checkout validation: delivery needs address, zone and the minimum; cash must cover the total", () => {
  const cfg = C.orderingConfig({ orderTypes: ["delivery", "pickup"], paymentMethods: ["efectivo"], deliveryZones: [{ name: "Centro", fee: 10000 }], minOrder: 60000 });
  const form = { type: "delivery", name: "Ana", address: "", zone: -1, payment: "efectivo", cash: "45000" };
  const e = C.checkoutErrors(cfg, form, 50000);
  assert.deepEqual(Object.keys(e).sort(), ["address", "cash", "type", "zone"]);
  assert.match(e.type, /Te faltan ₲ 10\.000/);
  assert.deepEqual(plain(C.checkoutErrors(cfg, { ...form, address: "Palma 123", zone: 0, cash: "70000" }, 60000)), {});
  assert.deepEqual(plain(C.checkoutErrors(cfg, { type: "pickup", name: "Ana", payment: "efectivo" }, 1000)), {}); // minimum is for delivery only
});

test("defaults: a restaurant without settings gets delivery + pickup, cash + transfer and a fee to confirm", () => {
  const cfg = plain(C.orderingConfig(undefined));
  assert.deepEqual(cfg.orderTypes, ["delivery", "pickup"]);
  assert.deepEqual(cfg.paymentMethods, ["efectivo", "transferencia"]);
  assert.equal(C.deliveryFee(cfg, { type: "delivery" }), null);
});

test("the WhatsApp message carries options, notes, fee and payment", () => {
  const cfg = C.orderingConfig({ deliveryZones: [{ name: "Centro", fee: 10000 }], paymentMethods: ["efectivo", "transferencia"] });
  const lines = [{ slug: "pizza", picks: [[1], [0]], note: "bien cocida", n: 2 }];
  const msg = C.orderMessage({ restaurant: "Gringo", lines, bySlug, cfg,
    form: { type: "delivery", name: " Ana ", address: "Palma 123", reference: "portón verde", zone: 0, payment: "efectivo", cash: "200000", note: "" } });
  assert.equal(msg, [
    "¡Hola Gringo! Quiero hacer este pedido:", "",
    "• 2 × Pizza (Grande, Cheddar) — ₲ 140.000", "   _Aclaración: bien cocida_", "",
    "Subtotal: ₲ 140.000", "Envío (Centro): ₲ 10.000", "*Total: ₲ 150.000*", "",
    "*Delivery*", "Nombre: Ana", "Dirección: Palma 123", "Referencia: portón verde", "Pago: Efectivo (pago con ₲ 200.000)", "",
    "Pedido desde el menú digital #MV",
  ].join("\n"));
  const tableMsg = C.orderMessage({ restaurant: "Gringo", lines, bySlug, cfg, table: "8", form: null });
  assert.match(tableMsg, /\*Total: ₲ 140\.000\*\nMesa 8/);
  const noFee = C.orderMessage({ restaurant: "G", lines, bySlug, cfg: C.orderingConfig({}), form: { type: "delivery", name: "A", address: "X", payment: "transferencia" } });
  assert.match(noFee, /Envío: a confirmar\n\*Total: ₲ 140\.000 \+ envío\*/);
});
