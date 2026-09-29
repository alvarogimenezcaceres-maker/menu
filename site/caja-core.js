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
  users: ["encargado"], devices: ["encargado"], code: ["encargado"],
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
export const isClosed = o => o.status === "cancelled" || (o.status === "delivered" && o.paid);

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
