// node --test site/ticket-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {};
vm.runInNewContext(readFileSync(new URL("./ticket-core.js", import.meta.url), "utf8"), ctx);
const T = ctx.Ticket;

const order = {
  ref: "K7Q2", kind: undefined, type: "delivery", name: "Lucía", note: "tocar timbre",
  fee: 10000, payMethod: "efectivo",
  lines: [
    { n: 2, name: "Burguer de la casa", extras: ["Doble", "Cheddar"], note: "sin cebolla", unit: 57000 },
    { n: 1, name: "Gaseosa", extras: [], note: "", unit: 8000 },
  ],
};
const table = {
  kind: "table", table: 5, payMethod: "tarjeta",
  lines: [{ n: 1, name: "Pizza", extras: [], note: "", unit: 60000, diner: "azul" }, { n: 2, name: "Cerveza", extras: [], note: "", unit: 15000, diner: "verde" }],
  bill: { tip: 9000, parts: [{ key: "azul", color: "azul", amount: 60000, tip: 6000, pay: 66000, items: [{ n: 1, name: "Pizza", shared: 1, amount: 60000 }] }, { key: "verde", color: "verde", amount: 30000, tip: 3000, pay: 33000, items: [] }] },
};

test("lines never pass the paper width", () => {
  for (const lines of [T.comanda(order, { restaurant: "Filigrana", by: "Pedro" }), T.precuenta(table, { restaurant: "Filigrana" }), T.ticket(order, { restaurant: "Filigrana" })]) {
    for (const l of lines) if (!l.big) assert.ok(l.text.length <= T.WIDTH, `too long: «${l.text}»`);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(T.wrap("una aclaración muy larga que no entra en una sola línea del papel", 20, 3))),
    ["una aclaración muy", "   larga que no", "   entra en una sola", "   línea del papel"]);
});

test("the comanda has the header, capitals, options and notes, and no prices", () => {
  const text = T.plainText(T.comanda(order, { restaurant: "Filigrana", by: "Pedro" }));
  assert.match(text, /DELIVERY/);
  assert.match(text, /#MV-K7Q2/);
  assert.match(text, /2x BURGUER DE LA CASA/);
  assert.match(text, /Doble, Cheddar/);
  assert.match(text, /\*\* SIN CEBOLLA \*\*/);
  assert.equal(/Gs\./.test(text), false);
  const round = T.plainText(T.comanda(table, { lines: [table.lines[1]] }));
  assert.match(round, /MESA 5/);
  assert.match(round, /2x CERVEZA \[Verde\]/);
  assert.equal(round.includes("PIZZA"), false); // only the new round
});

test("precuenta and ticket add up, and the split parts show", () => {
  const pre = T.plainText(T.precuenta(table, { restaurant: "Filigrana" }));
  assert.match(pre, /TOTAL\s+Gs\. 90\.000/);
  assert.match(pre, /Azul\s+Gs\. 66\.000/);
  assert.match(pre, /No válido como factura/);
  const tk = T.plainText(T.ticket(order, {}));
  assert.match(tk, /Envío\s+Gs\. 10\.000/);
  assert.match(tk, /TOTAL\s+Gs\. 132\.000/);
  assert.match(tk, /Pago: Efectivo/);
  const part = T.plainText(T.ticket(table, { part: { ...table.bill.parts[0], method: "qr" } }));
  assert.match(part, /Propina\s+Gs\. 6\.000/);
  assert.match(part, /TOTAL\s+Gs\. 66\.000/);
  assert.match(part, /Pago: QR/);
});

test("the PDF is well formed: header, xref offsets that point at each object, Latin-1 text", () => {
  const bytes = T.pdf(T.comanda(order, { restaurant: "Filigrana (Luque)", by: "Ana" }));
  const s = Buffer.from(bytes).toString("latin1");
  assert.ok(s.startsWith("%PDF-1.4"));
  assert.ok(s.trimEnd().endsWith("%%EOF"));
  const xrefAt = +/startxref\n(\d+)/.exec(s)[1];
  assert.equal(s.slice(xrefAt, xrefAt + 4), "xref");
  const offsets = [...s.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map(m => +m[1]);
  assert.equal(offsets.length, 6);
  offsets.forEach((o, i) => assert.equal(s.slice(o, o + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
  const len = +/\/Length (\d+) >>\nstream\n/.exec(s)[1];
  const start = s.indexOf("stream\n") + 7;
  assert.equal(s.slice(start + len, start + len + 10), "\nendstream");
  assert.ok(s.includes("Filigrana \\(Luque\\)")); // parentheses escaped
  assert.ok(s.includes("Luc\xeda")); // í as one Latin-1 byte
});

test("the shift summary PDF lists methods, tips, cancellations and pending", () => {
  const sum = { since: Date.UTC(2026, 8, 30, 21), until: Date.UTC(2026, 8, 30, 23), count: 3, tables: 2, orders: 1, sales: 250000, tips: 9000, fees: 10000,
    byMethod: { efectivo: 150000, qr: 100000 }, cancelled: [{ label: "#MV-CANC", amount: 45000, reason: "fuera de zona" }],
    pending: { unpaid: 1, unpaidTotal: 30000, street: { Luis: 114000 }, openTables: 1, openTablesTotal: 15000, waiting: 0 } };
  const lines = T.resumen(sum, { restaurant: "Filigrana", openedBy: "Ana", closedBy: "Sofía" });
  const text = T.plainText(lines);
  assert.match(text, /CIERRE DE TURNO/);
  assert.match(text, /Efectivo\s+Gs\. 150\.000/);
  assert.match(text, /TOTAL VENDIDO\s+Gs\. 250\.000/);
  assert.match(text, /Propinas \(aparte\)\s+Gs\. 9\.000/);
  assert.match(text, /fuera de\s+zona/);
  assert.match(text, /Efectivo con Luis\s+Gs\. 114\.000/);
  for (const l of lines) if (!l.big) assert.ok(l.text.length <= T.WIDTH, `too long: «${l.text}»`);
});
