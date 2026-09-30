// Mesaverso Caja: pure order rules shared by the Durable Object (site/caja.js) and the tests
// (site/caja-core.test.mjs). An order has two independent axes: preparation (`status`) and `paid`;
// it is closed as a sale once it is delivered and paid. Spec: plan/pos/diseno/fase0.md §2 (gitignored).
import "./order-core.js";

const C = globalThis.OrderCore;

export const ROLES = ["mozo", "cajero", "encargado"];
export const ROLE_LABEL = { mozo: "Mozo", cajero: "Cajero", encargado: "Encargado" };
export const STATUSES = ["new", "prep", "ready", "street", "delivered", "cancelled"];
export const PAY_METHODS = ["efectivo", "transferencia", "qr", "tarjeta"];
const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I: the code is read aloud and typed

export class CajaError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new CajaError(code, message); };

// Who may run each operation (DEC-063: mozo, cajero and encargado exist from the pilot).
const CAN = {
  accept: ROLES, reject: ROLES, ready: ROLES, street: ROLES, deliver: ROLES, addItems: ROLES, create: ROLES,
  paid: ["cajero", "encargado"], rendido: ["cajero", "encargado"],
  cancel: ["encargado"],
  users: ["encargado"], devices: ["encargado"], code: ["encargado"], take: ROLES, acceptRound: ROLES, rejectRound: ROLES,
};
export const can = (role, op) => (CAN[op] || []).includes(role);

export const newRef = (rand = crypto.getRandomValues(new Uint8Array(4))) => [...rand].map(b => REF_CHARS[b % REF_CHARS.length]).join("");
export const validRef = ref => typeof ref === "string" && new RegExp(`^[${REF_CHARS}]{4}$`).test(ref);

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bySlugOf = catalog => {
  const map = {};
  for (const c of catalog.categories || []) for (const d of c.dishes || []) map[d.slug] = { ...d, cat: c.slug };
  return map;
};

// Lines as the menu sends them ({ slug, picks, note, n }) → priced lines checked against the published catalog.
// The phone's prices are never trusted: price and names come from the catalog.
export function priceLines(rawLines, catalog) {
  if (!Array.isArray(rawLines) || !rawLines.length || rawLines.length > 40) fail("lines", "El pedido no tiene ítems válidos.");
  const bySlug = bySlugOf(catalog);
  const lines = C.restoreLines(rawLines.map(l => ({ slug: l && l.slug, picks: l && l.picks, note: l && l.note, n: l && l.n })), bySlug);
  if (lines.length !== rawLines.length) fail("lines", "Algún ítem ya no está en el menú o está agotado.");
  return lines.map(l => {
    const d = bySlug[l.slug];
    const unit = C.unitPrice(d, l.picks);
    return { slug: l.slug, name: d.name, picks: l.picks, extras: C.describePicks(d, l.picks), note: l.note, n: l.n, unit, round: 0 };
  });
}
export const subtotal = lines => lines.reduce((s, l) => s + l.unit * l.n, 0);

// A new order from the menu (src "wa") or typed by the staff (src "manual").
export function buildOrder({ ref, lines, form, src }, catalog, now = Date.now()) {
  if (!validRef(ref)) fail("ref", "Código de pedido inválido.");
  const cfg = C.orderingConfig(catalog.ordering);
  const priced = priceLines(lines, catalog);
  const f = form || {};
  const clean = {
    type: f.type, name: str(f.name, 60), address: str(f.address, 140), reference: str(f.reference, 100),
    zone: Number.isInteger(f.zone) ? f.zone : -1, payment: f.payment, cash: str(String(f.cash ?? ""), 12).replace(/\D/g, ""), note: str(f.note, 200),
  };
  const sub = subtotal(priced);
  // same rules as the menu's checkout; the staff may skip the address for a phone order they will call back
  const errs = C.checkoutErrors(cfg, clean, sub);
  if (src === "manual") { delete errs.address; delete errs.type; }
  const first = Object.values(errs)[0];
  if (first) fail("form", first);
  const fee = C.deliveryFee(cfg, clean);
  return {
    ref, src: src === "manual" ? "manual" : "wa", createdAt: now, updatedAt: now, status: "new", paid: false, payMethod: clean.payment,
    type: clean.type, zone: cfg.zones[clean.zone]?.name || "", fee, name: clean.name, address: clean.type === "delivery" ? clean.address : "",
    reference: clean.type === "delivery" ? clean.reference : "", note: clean.note, cash: clean.payment === "efectivo" && clean.cash ? +clean.cash : null,
    rider: "", cancelReason: "", closedAt: null, lines: priced, rounds: 1,
  };
}
export const orderTotal = o => subtotal(o.lines) + (o.fee || 0);
// a table session is closed once it is paid or cancelled; an order, once delivered and paid (or cancelled)
export const isClosed = o => o.kind === "table" ? o.status !== "open" : o.status === "cancelled" || (o.status === "delivered" && o.paid);

/* ---------- mesas (DEC-064) ---------- */
// Colors for the diners of a table, in joining order. Always shown with their name, never color alone.
export const DINER_COLORS = [
  { key: "azul", name: "Azul", hex: "#5B9DFF" }, { key: "verde", name: "Verde", hex: "#4CC38A" },
  { key: "naranja", name: "Naranja", hex: "#FF9A4D" }, { key: "violeta", name: "Violeta", hex: "#B9A3FF" },
  { key: "rosa", name: "Rosa", hex: "#FF7EB6" }, { key: "celeste", name: "Celeste", hex: "#4FD1E0" },
  { key: "amarillo", name: "Amarillo", hex: "#FFD84D" }, { key: "rojo", name: "Rojo", hex: "#FF6B6B" },
];
// at the table the card is charged right there, not «al recibir» as in a delivery
const TABLE_PAY_LABEL = { ...C.PAYMENT_LABEL, tarjeta: "Tarjeta" };
const COLOR_NAME = Object.fromEntries(DINER_COLORS.map(c => [c.key, c.name]));
export const validDiner = id => typeof id === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(id);
export const validTable = n => Number.isInteger(n) && n >= 1 && n <= 200;

// The diner (a random id kept on their phone) gets the next free color of the table.
export function addDiner(session, dinerId) {
  if (!validDiner(dinerId)) return { session, color: null };
  const found = session.diners.find(d => d.id === dinerId);
  if (found) return { session, color: found.color };
  const used = new Set(session.diners.map(d => d.color));
  const color = (DINER_COLORS.find(c => !used.has(c.key)) || DINER_COLORS[session.diners.length % DINER_COLORS.length]).key;
  return { session: { ...session, diners: [...session.diners, { id: dinerId, color }] }, color };
}

// A table opened by the waiter from the order a diner showed (or empty, when the waiter opens it by hand).
export function openTable({ ref, table, lines, dinerId, by, joinToken }, now = Date.now()) {
  if (!validTable(table)) fail("table", "Elegí el número de mesa.");
  let session = { ref, kind: "table", table, status: "open", createdAt: now, updatedAt: now, diners: [], lines: [], rounds: 0,
    pending: [], joinToken: joinToken || "", paid: false, payMethod: "", closedAt: null, cancelReason: "", openedBy: by || "" };
  if (lines && lines.length) session = addRound(session, lines, dinerId).session;
  return session;
}
// One accepted batch of items; each line remembers who ordered it (the diner's color, or none for the staff).
export function addRound(session, pricedLines, dinerId) {
  const { session: s, color } = addDiner(session, dinerId);
  const round = s.rounds;
  return { session: { ...s, rounds: round + 1, lines: [...s.lines, ...pricedLines.map(l => ({ ...l, round, diner: color }))] }, color };
}

// A diner at an open table sends an order from the phone: it waits until the mozo or the cajera accepts it (DEC-064).
export const MAX_PENDING = 6;
export function addPending(session, dinerId, pricedLines, id, now = Date.now()) {
  if (isClosed(session)) fail("closed", "Esta mesa ya está cerrada.");
  if (!validDiner(dinerId)) fail("diner", "No pude identificar tu celular. Volvé a escanear el QR de la mesa.");
  const mine = (session.pending || []).filter(p => p.dinerId === dinerId);
  if (mine.length >= 2) fail("locked", "Ya tenés pedidos esperando al mozo. Esperá a que los acepte.");
  if ((session.pending || []).length >= MAX_PENDING) fail("locked", "La mesa tiene muchos pedidos esperando. Llamá al mozo.");
  const { session: s, color } = addDiner(session, dinerId);
  return { session: { ...s, updatedAt: now, pending: [...(s.pending || []), { id, dinerId, color, lines: pricedLines, at: now }] }, color };
}

// What a diner's phone sees: the table's account by color, never the join token or other phones' ids.
export function dinerView(session, dinerId) {
  const me = session.diners.find(d => d.id === dinerId);
  const line = l => ({ name: l.name, extras: l.extras, note: l.note, n: l.n, unit: l.unit, diner: l.diner || null, round: l.round });
  return {
    table: session.table, status: session.status, me: me ? me.color : null, colors: session.diners.map(d => d.color),
    lines: session.lines.map(line), total: orderTotal(session),
    pending: (session.pending || []).map(p => ({ id: p.id, color: p.color, mine: p.dinerId === dinerId, lines: p.lines.map(line), at: p.at })),
    billRequested: !!session.bill,
    bill: session.bill ? { ...session.bill, parts: session.bill.parts.map(p => ({ ...p, paid: !!session.bill.paid[p.key] })) } : null,
  };
}

// «Pedir la cuenta» from a phone: the split is computed here (same code as the phone's preview) and kept until
// the account changes. The cajera then registers each part's payment.
export function requestBill(session, split, dinerId, now = Date.now()) {
  if (isClosed(session)) fail("closed", "Esta mesa ya está cerrada.");
  if ((session.pending || []).length) fail("state", "Hay pedidos esperando al mozo: esperá a que los acepte para pedir la cuenta.");
  const colors = session.diners.map(d => d.color);
  let bill;
  try { bill = C.splitBill(session.lines, colors, split); } catch (e) { fail("split", e.message); }
  const by = session.diners.find(d => d.id === dinerId)?.color || null;
  return { ...session, updatedAt: now, bill: { ...bill, split: { mode: split.mode, assign: split.assign, n: split.n, amounts: split.amounts, tipMode: split.tipMode, tipAmount: split.tipAmount }, by, at: now, paid: {} } };
}

export function applyTableOp(session, op, args, role, catalog, now = Date.now()) {
  if (op === "acceptRound" || op === "rejectRound") {
    if (!can(role, op)) fail("role", `Tu rol (${ROLE_LABEL[role] || role}) no puede hacer esto.`);
    if (isClosed(session)) fail("closed", "Esta mesa ya está cerrada.");
    const p = (session.pending || []).find(x => x.id === args.id);
    if (!p) fail("state", "Ese pedido ya fue atendido.");
    const rest = session.pending.filter(x => x !== p);
    const label = COLOR_NAME[p.color] || "";
    if (op === "rejectRound") return { order: { ...session, updatedAt: now, pending: rest }, text: `Pedido de ${label} rechazado${args.reason ? ": " + str(args.reason, 120) : ""}` };
    const s = addRound({ ...session, updatedAt: now, pending: rest, bill: null }, p.lines, p.dinerId).session;
    return { order: s, text: `Pedido de ${label} aceptado: ${p.lines.map(l => `${l.n} × ${l.name}`).join(", ")}` };
  }
  if (op === "payPart") {
    if (!can(role, "paid")) fail("role", `Tu rol (${ROLE_LABEL[role] || role}) no puede cobrar.`);
    if (isClosed(session)) fail("closed", "Esta mesa ya está cerrada.");
    const bill = session.bill;
    if (!bill) fail("state", "La mesa no pidió la cuenta dividida.");
    const part = bill.parts.find(p => p.key === args.key);
    if (!part) fail("state", "No encontré esa parte de la cuenta.");
    if (bill.paid[part.key]) fail("state", "Esa parte ya está pagada.");
    if (!PAY_METHODS.includes(args.method)) fail("state", "Elegí la forma de pago.");
    const paid = { ...bill.paid, [part.key]: args.method };
    const s = { ...session, updatedAt: now, bill: { ...bill, paid } };
    const who = part.color ? COLOR_NAME[part.color] : "Persona " + part.key.slice(1);
    let text = `Pagó ${who} · ${TABLE_PAY_LABEL[args.method]} · ${C.money(part.pay)}`;
    if (bill.parts.every(p => paid[p.key])) {
      const methods = [...new Set(Object.values(paid))];
      Object.assign(s, { status: "paid", paid: true, payMethod: methods.length === 1 ? methods[0] : "mixto", closedAt: now });
      text += " · mesa cerrada";
    }
    return { order: s, text };
  }
  const opFor = { addItems: "addItems", charge: "paid", cancel: "cancel" }[op];
  if (!opFor) fail("op", "Operación desconocida.");
  if (!can(role, opFor)) fail("role", `Tu rol (${ROLE_LABEL[role] || role}) no puede hacer esto.`);
  if (isClosed(session)) fail("closed", "Esta mesa ya está cerrada.");
  let s = { ...session, updatedAt: now }, text;
  if (op === "addItems") {
    const priced = priceLines(args.lines, catalog);
    s = addRound({ ...s, bill: null }, priced, null).session;
    text = `Agregado: ${priced.map(l => `${l.n} × ${l.name}`).join(", ")}`;
  } else if (op === "charge") {
    if (!s.lines.length) fail("state", "La mesa no tiene consumo. Para liberarla, cancelala.");
    if ((s.pending || []).length) fail("state", "Hay pedidos esperando: aceptalos o rechazalos antes de cobrar.");
    const method = PAY_METHODS.includes(args.method) ? args.method : "";
    if (!method) fail("state", "Elegí la forma de pago.");
    s.status = "paid"; s.paid = true; s.payMethod = method; s.closedAt = now;
    text = `Cobrada · ${TABLE_PAY_LABEL[method]} · ${C.money(orderTotal(s))}`;
  } else {
    const reason = str(args.reason, 120);
    if (!reason) fail("state", "Escribí el motivo.");
    s.status = "cancelled"; s.cancelReason = reason; s.closedAt = now;
    text = "Mesa cancelada: " + reason;
  }
  return { order: s, text };
}

// Applies one staff operation. Returns the updated order and a short history text; throws CajaError when not allowed.
export function applyOp(order, op, args, role, catalog, now = Date.now()) {
  if (!can(role, op)) fail("role", `Tu rol (${ROLE_LABEL[role] || role}) no puede hacer esto.`);
  if (isClosed(order)) fail("closed", "Este pedido ya está cerrado.");
  const o = { ...order, lines: order.lines.slice(), updatedAt: now };
  const need = (cond, msg) => { if (!cond) fail("state", msg); };
  let text;
  switch (op) {
    case "accept": need(o.status === "new", "El pedido ya fue aceptado."); o.status = "prep"; text = "Aceptado"; break;
    case "reject": case "cancel": {
      if (op === "reject") need(o.status === "new", "Solo se rechaza un pedido nuevo. Para uno aceptado, cancelalo.");
      const reason = str(args.reason, 120);
      need(reason, "Escribí el motivo.");
      o.status = "cancelled"; o.cancelReason = reason; text = (op === "reject" ? "Rechazado: " : "Cancelado: ") + reason; break;
    }
    case "ready": need(o.status === "prep", "El pedido no está en cocina."); o.status = "ready"; text = "Listo para retirar"; break;
    case "street":
      need(o.status === "prep" || o.status === "ready", "El pedido no está en cocina.");
      need(o.type === "delivery", "Este pedido es para retirar.");
      o.status = "street"; o.rider = str(args.rider, 40); text = "Salió" + (o.rider ? " con " + o.rider : ""); break;
    case "deliver": need(["ready", "street"].includes(o.status), "El pedido todavía no está listo."); o.status = "delivered"; text = "Entregado"; break;
    case "paid": {
      need(o.status !== "new", "Aceptá el pedido antes de registrar el pago.");
      need(!o.paid, "Este pedido ya está pagado.");
      const method = PAY_METHODS.includes(args.method) ? args.method : o.payMethod;
      need(PAY_METHODS.includes(method), "Elegí la forma de pago.");
      o.paid = true; o.payMethod = method;
      if (args.deliver) { need(o.status !== "prep" || o.type !== "delivery", "Un delivery se entrega al volver."); o.status = "delivered"; }
      text = `Pagado · ${C.PAYMENT_LABEL[method]}`; break;
    }
    case "rendido":
      need(o.status === "street" && o.payMethod === "efectivo" && !o.paid, "Solo se rinde un delivery en efectivo que está en la calle.");
      o.paid = true; o.status = "delivered"; text = `Rendido${o.rider ? " por " + o.rider : ""} · ${C.money(orderTotal(o))}`; break;
    case "addItems": {
      const extra = priceLines(args.lines, catalog).map(l => ({ ...l, round: o.rounds }));
      o.lines.push(...extra); o.rounds += 1;
      text = `Agregado: ${extra.map(l => `${l.n} × ${l.name}`).join(", ")}`; break;
    }
    default: fail("op", "Operación desconocida.");
  }
  if (isClosed(o)) o.closedAt = now;
  return { order: o, text };
}

// Personal data kept only while it is useful to the restaurant (plan: 30 days).
export const PII_DAYS = 30;
export const wipePii = o => ({ ...o, name: o.name ? "(borrado)" : "", address: "", reference: "", note: "" });
