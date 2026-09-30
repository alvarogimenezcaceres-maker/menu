// Mesaverso Caja: one Durable Object per restaurant (SQLite storage, free plan). Routes under /api/<slug>/…
// The rules live in caja-core.js; this file is storage, auth and live updates.
//
// Auth, from the outside in:
//  1. A tablet is linked once with the restaurant code (HMAC of CAJA_SECRET, never stored or published).
//     The first link also creates the encargado. The device keeps a random token (only its hash is stored).
//  2. Each person picks their name and types a 4-digit PIN (5 wrong tries lock the user and the device for 10 min).
//  3. The session token goes in `Authorization: Bearer`; WebSockets use a single-use ticket (tokens never go in URLs).
// Privacy: the menu's orders are stored only once the restaurant is activated; names and addresses are wiped
// 30 days after the sale closes (daily alarm).
// Tables (DEC-064): each open table has a random join token (the table QR). Diners' phones use it to join, order and
// watch the account; they get their own WebSocket with a filtered view (dinerView), never the staff broadcast.
import QRCode from "qrcode/lib/core/qrcode.js";
import QRSvg from "qrcode/lib/renderer/svg-tag.js";
import { applyOp, applyTableOp, addDiner, addPending, addRound, buildOrder, can, dinerView, requestBill, shiftSummary, shiftRows, toCsv, soldOutNow, withSoldOut, isClosed, newRef, openTable, orderTotal, priceLines, PII_DAYS, ROLES, validDiner, validRef, validTable, wipePii, CajaError } from "./caja-core.js";
import { sameOrigin } from "./events.js";

const C = globalThis.OrderCore; // loaded by caja-core.js

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DAY = 86400000;
const SESSION_MS = 16 * 3600000; // one long shift
const LOCK_MS = 10 * 60000;
const MAX_BODY = 32 * 1024;
const DRAFT_MS = 30 * 60000; // a table order shown to the waiter waits this long

// The QR a diner shows the waiter: it only carries a URL with the 4-letter code, so it stays small and easy to scan.
// The table QR opens the menu with the join token; `unirse` is not the old `?mesa=N` of the printed table QRs.
const joinLink = (url, slug, token) => `${url.origin}/${slug}/?unirse=${encodeURIComponent(token)}`;
const qrSvg = text => QRSvg.render(QRCode.create(text, { errorCorrectionLevel: "M" }), { margin: 1, color: { dark: "#0E1014ff", light: "#ffffffff" } });

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const err = (status, message, code = "error") => json({ error: message, code }, status);
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomToken = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
const enc = new TextEncoder();
async function sha256(text) { return b64u(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)))); }
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}
const B32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// 12 characters (60 bits), shown as XXXX-XXXX-XXXX; `gen` changes when the encargado asks for a new one
export async function restaurantCode(secret, slug, gen) {
  const h = await hmac(secret, `caja:${slug}:${gen}`);
  let out = "";
  for (let i = 0; i < 12; i++) out += B32[h[i] % 32];
  return out.match(/.{4}/g).join("-");
}
const sameText = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

// Worker entry: /api/<slug>/… → that restaurant's object.
export async function handleCaja(request, env) {
  const url = new URL(request.url);
  const [, , slug, ...rest] = url.pathname.split("/");
  if (!slug || !SLUG.test(slug) || !env.CAJA) return err(404, "No encontrado.");
  if (request.method === "POST" && !sameOrigin(request)) return err(403, "Origen no permitido.");
  const stub = env.CAJA.get(env.CAJA.idFromName(slug));
  const inner = new URL(request.url);
  inner.pathname = "/" + rest.join("/");
  inner.searchParams.set("slug", slug);
  return stub.fetch(new Request(inner, request));
}

// A plain class (not `extends DurableObject`) so the Node tests can import the Worker.
export class Caja {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.catalog = null;
    this.catalogAt = 0;
    this.publicHits = [];
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, failed INTEGER DEFAULT 0, locked_until INTEGER DEFAULT 0, active INTEGER DEFAULT 1);
      CREATE TABLE IF NOT EXISTS devices (hash TEXT PRIMARY KEY, name TEXT, created INTEGER, seen INTEGER, failed INTEGER DEFAULT 0, locked_until INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, device TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS tickets (hash TEXT PRIMARY KEY, session TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS orders (ref TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL, closed INTEGER, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS orders_closed ON orders(closed);
      CREATE TABLE IF NOT EXISTS shifts (id INTEGER PRIMARY KEY AUTOINCREMENT, start INTEGER NOT NULL, end INTEGER NOT NULL, opened_by TEXT, closed_by TEXT, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS drafts (code TEXT PRIMARY KEY, created INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT NOT NULL, at INTEGER NOT NULL, who TEXT, text TEXT);
      CREATE INDEX IF NOT EXISTS history_ref ON history(ref);`);
    // «caja»: the tablet that keeps every PDF (comandas, tickets, shift closes). Added 2026-09-30.
    if (!this.sql.exec("PRAGMA table_info(devices)").toArray().some(c => c.name === "kind")) this.sql.exec("ALTER TABLE devices ADD COLUMN kind TEXT DEFAULT ''");
  }

  meta(k, fallback = null) { const r = this.sql.exec("SELECT v FROM meta WHERE k = ?", k).toArray()[0]; return r ? r.v : fallback; }
  setMeta(k, v) { this.sql.exec("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", k, String(v)); }
  activated() { return this.sql.exec("SELECT COUNT(*) AS n FROM users WHERE active = 1").one().n > 0; }

  soldOutMarks() { try { return JSON.parse(this.meta("soldout", "{}")) || {}; } catch { return {}; } }
  soldOutList() { return soldOutNow(this.soldOutMarks()); }
  // what orders are priced and checked against: the published menu plus today's «agotado» marks from the caja
  async orderCatalog(slug) { return withSoldOut(await this.loadCatalog(slug), this.soldOutList()); }
  async loadCatalog(slug) {
    if (this.catalog && Date.now() - this.catalogAt < 60000) return this.catalog;
    const res = await this.env.ASSETS.fetch(new Request(`https://assets.local/${slug}/catalog.json`));
    if (!res.ok) throw new CajaError("catalog", "No se encontró el menú publicado de este local.");
    this.catalog = await res.json(); this.catalogAt = Date.now();
    return this.catalog;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug");
    const route = request.method + " " + url.pathname;
    try {
      if (route === "GET /ws") return await this.upgrade(request, url);
      if (route === "GET /mesa/ws") return await this.dinerUpgrade(request, url);
      if (route === "GET /mesa/cuenta") return this.dinerAccount(url, slug);
      if (request.method === "GET" && url.pathname.startsWith("/mesa/")) return this.draftStatus(url);
      let body = {};
      if (request.method === "POST") {
        const text = await request.text();
        if (text.length > MAX_BODY) return err(413, "Pedido demasiado grande.");
        try { body = text ? JSON.parse(text) : {}; } catch { return err(400, "JSON inválido."); }
      }
      switch (route) {
        case "GET /activa": return json({ caja: this.activated() }); // the menu picks its privacy text
        case "GET /agotados": return json({ slugs: this.soldOutList() }); // the menu greys these out
        case "POST /pedidos": return await this.publicOrder(body, slug);
        case "POST /mesa": return await this.tableDraft(body, slug, url);
        case "POST /mesa/unirse": return this.dinerJoin(body, slug, url);
        case "POST /mesa/pedir": return await this.dinerOrder(body, slug, url);
        case "POST /mesa/cuenta": return this.dinerBill(body, slug, url);
        case "POST /vincular": return await this.link(body, slug);
        case "GET /usuarios": return await this.userList(request);
        case "POST /entrar": return await this.login(body, request);
        case "POST /salir": { const s = await this.session(request); this.endSessions("hash = ?", s.hash); return json({ ok: true }); }
        case "GET /estado": return await this.state(request, slug);
        case "POST /op": return await this.op(request, body, slug);
        case "POST /ws-ticket": return await this.wsTicket(request);
        case "GET /equipo": return await this.team(request);
        case "POST /equipo": return await this.teamChange(request, body, slug);
        default: return err(404, "No encontrado.");
      }
    } catch (e) {
      if (e instanceof CajaError) return err(e.code === "auth" ? 401 : e.code === "role" ? 403 : e.code === "locked" ? 429 : 400, e.message, e.code);
      console.error("caja", e && e.stack || e);
      return err(500, "Error interno. Probá de nuevo.");
    }
  }

  /* ---------- auth ---------- */
  async device(request) {
    const token = request.headers.get("x-device") || "";
    if (!token) throw new CajaError("auth", "Este dispositivo no está vinculado.");
    const hash = await sha256(token);
    const d = this.sql.exec("SELECT * FROM devices WHERE hash = ?", hash).toArray()[0];
    if (!d) throw new CajaError("auth", "Este dispositivo no está vinculado.");
    return d;
  }
  async session(request) {
    const token = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
    if (!token) throw new CajaError("auth", "Entrá con tu PIN.");
    const hash = await sha256(token);
    const s = this.sql.exec("SELECT s.hash, s.expires, s.device, u.id, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ? AND u.active = 1", hash).toArray()[0];
    if (!s || s.expires < Date.now()) throw new CajaError("auth", "La sesión venció. Entrá con tu PIN.");
    // the device must still be linked (revoking a tablet ends its sessions)
    if (!this.sql.exec("SELECT 1 FROM devices WHERE hash = ?", s.device).toArray().length) throw new CajaError("auth", "Este dispositivo fue desvinculado.");
    return s;
  }
  async pinHash(salt, pin) { return b64u(await hmac(this.env.CAJA_SECRET, `pin:${salt}:${pin}`)); }
  checkPin(pin) { if (!/^\d{4}$/.test(String(pin))) throw new CajaError("pin", "El PIN tiene 4 números."); return String(pin); }
  checkName(name) { const n = String(name || "").trim().slice(0, 30); if (!n) throw new CajaError("name", "Escribí el nombre."); return n; }

  async link(body, slug) {
    if (!this.env.CAJA_SECRET) throw new CajaError("setup", "La caja todavía no está habilitada en este servidor.");
    const lockedUntil = +this.meta("link_locked_until", 0);
    if (lockedUntil > Date.now()) throw new CajaError("locked", "Demasiados intentos. Probá en unos minutos.");
    const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})(?=.)/g, "$1-");
    const expected = await restaurantCode(this.env.CAJA_SECRET, slug, this.meta("code_gen", "0"));
    if (!sameText(code, expected)) {
      const fails = +this.meta("link_fails", 0) + 1;
      this.setMeta("link_fails", fails);
      if (fails >= 5) { this.setMeta("link_locked_until", Date.now() + LOCK_MS); this.setMeta("link_fails", 0); }
      throw new CajaError("code", "El código del local no es correcto.");
    }
    this.setMeta("link_fails", 0);
    const first = !this.activated();
    let user = null;
    if (first) {
      // the first tablet creates the encargado
      const name = this.checkName(body.name), pin = this.checkPin(body.pin), salt = randomToken(12);
      this.sql.exec("INSERT INTO users (name, role, salt, hash) VALUES (?, 'encargado', ?, ?)", name, salt, await this.pinHash(salt, pin));
      user = this.sql.exec("SELECT id, name, role FROM users ORDER BY id DESC LIMIT 1").one();
      this.setMeta("shift_start", Date.now()); this.setMeta("shift_by", name);
      await this.ctx.storage.setAlarm(Date.now() + DAY);
    }
    const token = randomToken();
    const hash = await sha256(token);
    this.sql.exec("INSERT INTO devices (hash, name, created, seen) VALUES (?, ?, ?, ?)", hash, String(body.deviceName || "Tablet").slice(0, 40), Date.now(), Date.now());
    const out = { device: token, activated: true };
    if (user) out.session = await this.newSession(user.id, hash), out.me = user;
    return json(out);
  }
  async newSession(userId, deviceHash) {
    const token = randomToken();
    this.sql.exec("DELETE FROM sessions WHERE expires < ?", Date.now());
    this.sql.exec("INSERT INTO sessions (hash, user_id, device, expires) VALUES (?, ?, ?, ?)", await sha256(token), userId, deviceHash, Date.now() + SESSION_MS);
    return token;
  }
  async userList(request) {
    await this.device(request);
    return json({ users: this.sql.exec("SELECT id, name, role FROM users WHERE active = 1 ORDER BY name").toArray() });
  }
  async login(body, request) {
    const d = await this.device(request);
    const now = Date.now();
    if (d.locked_until > now) throw new CajaError("locked", "Demasiados intentos en esta tablet. Esperá 10 minutos.");
    const u = this.sql.exec("SELECT * FROM users WHERE id = ? AND active = 1", +body.userId).toArray()[0];
    if (!u) throw new CajaError("auth", "Elegí tu nombre.");
    if (u.locked_until > now) throw new CajaError("locked", "Demasiados intentos con este usuario. Esperá 10 minutos.");
    const pin = this.checkPin(body.pin);
    if (!sameText(await this.pinHash(u.salt, pin), u.hash)) {
      const uf = u.failed + 1, df = d.failed + 1;
      this.sql.exec("UPDATE users SET failed = ?, locked_until = ? WHERE id = ?", uf >= 5 ? 0 : uf, uf >= 5 ? now + LOCK_MS : 0, u.id);
      this.sql.exec("UPDATE devices SET failed = ?, locked_until = ? WHERE hash = ?", df >= 5 ? 0 : df, df >= 5 ? now + LOCK_MS : 0, d.hash);
      throw new CajaError("pin", `PIN incorrecto. ${Math.max(0, 5 - uf)} intentos más antes de bloquear.`);
    }
    this.sql.exec("UPDATE users SET failed = 0, locked_until = 0 WHERE id = ?", u.id);
    this.sql.exec("UPDATE devices SET failed = 0, locked_until = 0, seen = ? WHERE hash = ?", now, d.hash);
    return json({ session: await this.newSession(u.id, d.hash), me: { id: u.id, name: u.name, role: u.role } });
  }

  /* ---------- pedidos ---------- */
  rows(where = "closed IS NULL OR closed > ?", ...args) {
    return this.sql.exec(`SELECT data FROM orders WHERE ${where} ORDER BY created`, ...args).toArray().map(r => JSON.parse(r.data));
  }
  getOrder(ref) {
    const r = this.sql.exec("SELECT data FROM orders WHERE ref = ?", ref).toArray()[0];
    if (!r) throw new CajaError("ref", "No encontré ese pedido.");
    return JSON.parse(r.data);
  }
  save(o, who, text) {
    this.sql.exec(`INSERT INTO orders (ref, created, updated, closed, data) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(ref) DO UPDATE SET updated = excluded.updated, closed = excluded.closed, data = excluded.data`,
      o.ref, o.createdAt, o.updatedAt, isClosed(o) ? o.closedAt || o.updatedAt : null, JSON.stringify(o));
    if (text) this.sql.exec("INSERT INTO history (ref, at, who, text) VALUES (?, ?, ?, ?)", o.ref, o.updatedAt, who || "", text);
    this.broadcast({ t: "order", order: this.withTotal(o) });
    if (o.kind === "table") this.pushToDiners(o);
  }
  withTotal(o) { return { ...o, total: orderTotal(o) }; }
  freeRef(wanted) {
    let ref = wanted;
    while (this.sql.exec("SELECT 1 FROM orders WHERE ref = ?", ref).toArray().length) ref = newRef() + "X";
    return ref;
  }

  async publicOrder(body, slug) {
    // not activated: nothing is stored and the menu keeps working with WhatsApp only
    if (!this.activated()) return new Response(null, { status: 204 });
    const now = Date.now();
    this.publicHits = this.publicHits.filter(t => now - t < 10 * 60000);
    if (this.publicHits.length >= 40) throw new CajaError("locked", "Demasiados pedidos seguidos. Mandalo solo por WhatsApp.");
    this.publicHits.push(now);
    if (!validRef(body.ref)) throw new CajaError("ref", "Código de pedido inválido.");
    // a retry of the same order (flaky phone connection) is not stored twice
    const same = this.sql.exec("SELECT data FROM orders WHERE ref = ? AND created > ?", body.ref, now - 10 * 60000).toArray()[0];
    if (same) return json({ ref: body.ref });
    const catalog = await this.loadCatalog(slug);
    const o = buildOrder({ ref: body.ref, lines: body.lines, form: body.form, src: "wa" }, withSoldOut(catalog, this.soldOutList()), now);
    o.waRef = o.ref; // the code the customer sees in the WhatsApp message
    o.ref = this.freeRef(o.ref);
    this.save(o, "Menú", "Entró por el menú (WhatsApp)");
    return json({ ref: o.ref });
  }

  async state(request, slug) {
    const s = await this.session(request);
    const since = Date.now() - 12 * 3600000;
    let catalog = null;
    try { catalog = await this.loadCatalog(slug); } catch { /* the board still works; pickers show an error */ }
    const dev = this.sql.exec("SELECT substr(hash, 1, 8) AS id, name, kind FROM devices WHERE hash = ?", s.device).toArray()[0] || {};
    return json({ me: { id: s.id, name: s.name, role: s.role }, device: { id: dev.id, name: dev.name, kind: dev.kind || "" }, orders: this.rows("closed IS NULL OR closed > ?", since).map(o => this.withTotal(o)), catalog, soldOut: this.soldOutList(), tables: catalog?.tables || 20, now: Date.now() });
  }

  async op(request, body, slug) {
    const s = await this.session(request);
    const who = s.name;
    if (body.op === "create") {
      if (!can(s.role, "create")) throw new CajaError("role", "Tu rol no puede crear pedidos.");
      const catalog = await this.orderCatalog(slug);
      const o = buildOrder({ ref: this.freeRef(newRef()), lines: body.lines, form: body.form, src: "manual" }, catalog);
      o.status = "prep"; // the staff typed it: it's already accepted
      this.save(o, who, "Cargado a mano por " + who);
      this.doc("comanda", o, { round: null });
      return json({ order: this.withTotal(o) });
    }
    if (body.op === "history") return json({ history: this.sql.exec("SELECT at, who, text FROM history WHERE ref = ? ORDER BY id", String(body.ref)).toArray() });
    if (body.op === "draft") return json(this.readDraft(body.code));
    if (body.op === "soldOut") {
      if (!can(s.role, "soldOut")) throw new CajaError("role", "Tu rol no puede marcar agotados.");
      const slugOk = typeof body.slug === "string" && /^[a-z0-9][a-z0-9-]{0,80}$/.test(body.slug);
      if (!slugOk) throw new CajaError("slug", "Producto inválido.");
      const marks = Object.fromEntries(Object.entries(this.soldOutMarks()).filter(([k]) => this.soldOutList().includes(k))); // drop yesterday's
      if (body.on) marks[body.slug] = { at: Date.now(), by: who }; else delete marks[body.slug];
      this.setMeta("soldout", JSON.stringify(marks));
      const slugs = this.soldOutList();
      this.broadcast({ t: "soldout", slugs });
      return json({ slugs });
    }
    if (body.op === "shiftCsv") {
      if (!can(s.role, "shift")) throw new CajaError("role", "Las ventas las ven la cajera y el encargado.");
      // a closed shift by id, or the open one
      const rec = body.id ? this.sql.exec("SELECT start, end FROM shifts WHERE id = ?", +body.id).toArray()[0] : { start: +this.meta("shift_start", 0), end: Date.now() };
      if (!rec) throw new CajaError("state", "No encontré ese turno.");
      return json({ csv: toCsv(shiftRows(this.rows("closed IS NOT NULL AND closed >= ? AND closed <= ?", rec.start, rec.end), rec.start, rec.end)), start: rec.start, end: rec.end });
    }
    if (body.op === "shift" || body.op === "closeShift" || body.op === "shifts") {
      if (!can(s.role, "shift")) throw new CajaError("role", "El turno lo ven la cajera y el encargado.");
      if (body.op === "shifts") return json({ shifts: this.sql.exec("SELECT id, start, end, opened_by AS openedBy, closed_by AS closedBy, data FROM shifts ORDER BY id DESC LIMIT 30").toArray().map(r => ({ ...r, summary: JSON.parse(r.data), data: undefined })) });
      // the first shift of a restaurant starts when it was activated (or now, for old data)
      const start = +this.meta("shift_start", 0), openedBy = this.meta("shift_by", "");
      const now = Date.now(), summary = shiftSummary(this.rows("closed IS NULL OR closed >= ?", start), start, now);
      if (body.op === "shift") return json({ start, openedBy, summary });
      this.sql.exec("INSERT INTO shifts (start, end, opened_by, closed_by, data) VALUES (?, ?, ?, ?, ?)", start, now, openedBy, who, JSON.stringify(summary));
      this.setMeta("shift_start", now); this.setMeta("shift_by", who);
      this.broadcast({ t: "shift", start: now, by: who });
      this.doc("cierre", null, { closed: { start, end: now, openedBy, closedBy: who, summary } });
      return json({ closed: { start, end: now, openedBy, closedBy: who, summary }, start: now });
    }
    if (body.op === "tableQr") {
      const t = this.getOrder(String(body.ref));
      if (t.kind !== "table" || t.status !== "open") throw new CajaError("state", "La mesa no está abierta.");
      return json({ qr: qrSvg(joinLink(new URL(request.url), slug, t.joinToken)), table: t.table });
    }
    if (body.op === "take") return json(this.takeDraft(body.code, body.table, s));
    if (body.op === "openTable") {
      if (!can(s.role, "create")) throw new CajaError("role", "Tu rol no puede abrir mesas.");
      const table = +body.table;
      if (!validTable(table)) throw new CajaError("table", "Elegí el número de mesa.");
      if (this.openTableSession(table)) throw new CajaError("state", `La mesa ${table} ya está abierta.`);
      const t = openTable({ ref: this.freeRef(newRef()), table, lines: [], by: who, joinToken: randomToken(18) });
      this.save(t, who, `Mesa ${table} abierta por ${who}`);
      return json({ order: this.withTotal(t) });
    }
    const current = this.getOrder(String(body.ref));
    if (current.kind === "table") {
      const catalog = body.op === "addItems" ? await this.orderCatalog(slug) : null;
      const { order, text } = applyTableOp(current, body.op, body.args || {}, s.role, catalog);
      this.save(order, who, `${text} (${who})`);
      if (body.op === "addItems" || body.op === "acceptRound") this.doc("comanda", order, { round: order.rounds - 1 });
      if (body.op === "charge") this.doc("ticket", order);
      if (body.op === "payPart") this.doc("ticket", order, { key: body.args.key });
      return json({ order: this.withTotal(order) });
    }
    if (body.updatedAt && body.updatedAt !== current.updatedAt && ["accept", "reject"].includes(body.op) && current.status !== "new") {
      throw new CajaError("stale", "Otra persona ya atendió este pedido.");
    }
    const catalog = body.op === "addItems" ? await this.orderCatalog(slug) : null;
    const { order, text } = applyOp(current, body.op, body.args || {}, s.role, catalog);
    this.save(order, who, `${text} (${who})`);
    if (body.op === "accept") this.doc("comanda", order, { round: null });
    if (body.op === "addItems") this.doc("comanda", order, { round: order.rounds - 1 });
    if (body.op === "paid" || body.op === "rendido") this.doc("ticket", order);
    return json({ order: this.withTotal(order) });
  }

  /* ---------- mesas: el pedido que el comensal le muestra al mozo ---------- */
  openTableSession(table) {
    return this.rows("closed IS NULL").find(o => o.kind === "table" && o.table === table && o.status === "open") || null;
  }
  async tableDraft(body, slug, url) {
    // not activated: the menu falls back to the plain «show the waiter» list
    if (!this.activated()) return new Response(null, { status: 204 });
    const now = Date.now();
    this.publicHits = this.publicHits.filter(t => now - t < 10 * 60000);
    if (this.publicHits.length >= 40) throw new CajaError("locked", "Demasiados pedidos seguidos. Mostrale la lista al mozo.");
    this.publicHits.push(now);
    const lines = priceLines(body.lines, await this.orderCatalog(slug));
    const diner = validDiner(body.diner) ? body.diner : null;
    this.sql.exec("DELETE FROM drafts WHERE created < ?", now - DRAFT_MS);
    // the same phone showing the same order again gets the same code
    for (const r of this.sql.exec("SELECT code, data FROM drafts").toArray()) {
      const d = JSON.parse(r.data);
      if (diner && d.diner === diner && !d.taken && JSON.stringify(d.lines) === JSON.stringify(lines)) return this.draftReply(r.code, url, slug);
    }
    let code = newRef();
    while (this.sql.exec("SELECT 1 FROM drafts WHERE code = ?", code).toArray().length) code = newRef();
    this.sql.exec("INSERT INTO drafts (code, created, data) VALUES (?, ?, ?)", code, now, JSON.stringify({ lines, diner, taken: null }));
    return this.draftReply(code, url, slug);
  }
  draftReply(code, url, slug) {
    const link = `${url.origin}/${slug}/caja/?tomar=${code}`;
    return json({ code, qr: qrSvg(link), expiresIn: DRAFT_MS });
  }
  // the diner's phone asks whether the waiter took the order (only that phone knows its diner id)
  draftStatus(url) {
    const code = url.pathname.split("/")[2] || "";
    const r = this.sql.exec("SELECT created, data FROM drafts WHERE code = ?", code).toArray()[0];
    if (!r) return json({ status: "expired" });
    const d = JSON.parse(r.data);
    if (!d.diner || d.diner !== url.searchParams.get("d")) return json({ status: "waiting" });
    if (d.taken) {
      // the diner who showed the order joins that table: their phone gets the table QR token
      const t = d.taken.ref && this.rows("ref = ?", d.taken.ref)[0];
      if (!t || t.status !== "open") return json({ status: "taken", table: d.taken.table });
      return json({ status: "taken", table: d.taken.table, token: t.joinToken, color: t.diners.find(x => x.id === d.diner)?.color || null });
    }
    return json({ status: Date.now() - r.created > DRAFT_MS ? "expired" : "waiting" });
  }
  readDraft(code) {
    const c = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const r = this.sql.exec("SELECT created, data FROM drafts WHERE code = ?", c).toArray()[0];
    if (!r || Date.now() - r.created > DRAFT_MS) throw new CajaError("draft", "No encontré ese pedido. Pedile al cliente que toque «Mostrar al mozo» de nuevo.");
    const d = JSON.parse(r.data);
    if (d.taken) throw new CajaError("draft", `Ese pedido ya se cargó en la mesa ${d.taken.table}.`);
    return { code: c, lines: d.lines, total: d.lines.reduce((sum, l) => sum + l.unit * l.n, 0) };
  }
  takeDraft(code, tableNo, s) {
    if (!can(s.role, "take")) throw new CajaError("role", "Tu rol no puede tomar pedidos.");
    const draft = this.readDraft(code);
    const table = +tableNo;
    if (!validTable(table)) throw new CajaError("table", "Elegí el número de mesa.");
    const d = JSON.parse(this.sql.exec("SELECT data FROM drafts WHERE code = ?", draft.code).one().data);
    const existing = this.openTableSession(table);
    let session, text;
    if (existing) {
      session = addRound({ ...existing, updatedAt: Date.now() }, d.lines, d.diner).session;
      text = `Pedido ${draft.code} agregado a la mesa ${table} por ${s.name}`;
    } else {
      session = openTable({ ref: this.freeRef(newRef()), table, lines: d.lines, dinerId: d.diner, by: s.name, joinToken: randomToken(18) });
      text = `Mesa ${table} abierta por ${s.name} con el pedido ${draft.code}`;
    }
    this.save(session, s.name, text);
    this.doc("comanda", session, { round: session.rounds - 1 });
    this.sql.exec("UPDATE drafts SET data = ? WHERE code = ?", JSON.stringify({ ...d, taken: { table, ref: session.ref, at: Date.now() } }), draft.code);
    return { order: this.withTotal(session), added: !!existing };
  }

  /* ---------- mesas: los comensales desde su celular ---------- */
  tableByToken(token) {
    if (typeof token !== "string" || token.length < 20) return null;
    return this.rows("closed IS NULL").find(o => o.kind === "table" && o.status === "open" && o.joinToken && o.joinToken === token) || null;
  }
  dinerReply(session, diner, url, slug) {
    return json({ view: dinerView(session, diner), qr: qrSvg(joinLink(url, slug, session.joinToken)) });
  }
  dinerJoin(body, slug, url) {
    const t = this.tableByToken(body.token);
    if (!t) throw new CajaError("mesa", "Esta mesa ya se cerró o el código no es válido. Pedile al mozo el QR de la mesa.");
    if (!validDiner(body.diner)) throw new CajaError("diner", "No pude identificar tu celular.");
    const { session, color } = addDiner(t, body.diner);
    if (session !== t) this.save({ ...session, updatedAt: Date.now() }, "Menú", `Se sumó un celular (${color})`);
    return this.dinerReply(session, body.diner, url, slug);
  }
  async dinerOrder(body, slug, url) {
    const now = Date.now();
    this.publicHits = this.publicHits.filter(t => now - t < 10 * 60000);
    if (this.publicHits.length >= 60) throw new CajaError("locked", "Demasiados pedidos seguidos. Llamá al mozo.");
    const t = this.tableByToken(body.token);
    if (!t) throw new CajaError("mesa", "Esta mesa ya se cerró. Pedile al mozo que la abra de nuevo.");
    this.publicHits.push(now);
    const lines = priceLines(body.lines, await this.orderCatalog(slug));
    const { session, color } = addPending(t, body.diner, lines, newRef(), now);
    this.save(session, "Menú", `Pedido nuevo desde el celular (${color}): ${lines.map(l => `${l.n} × ${l.name}`).join(", ")}`);
    return this.dinerReply(session, body.diner, url, slug);
  }
  dinerBill(body, slug, url) {
    const t = this.tableByToken(body.token);
    if (!t) throw new CajaError("mesa", "Esta mesa ya se cerró.");
    if (!validDiner(body.diner) || !t.diners.some(d => d.id === body.diner)) throw new CajaError("diner", "Tu celular no está en esta mesa. Escaneá el QR de la mesa.");
    const s = requestBill(t, body.split || {}, body.diner);
    const how = { consumo: "por consumo", iguales: "en partes iguales", libres: "por montos" }[s.bill.mode];
    this.save(s, "Menú", `Pidió la cuenta (${s.bill.by || ""}) dividida ${how}: ${s.bill.parts.length} partes, ${C.money(s.bill.grand)}`);
    return this.dinerReply(s, body.diner, url, slug);
  }
  dinerAccount(url, slug) {
    const t = this.tableByToken(url.searchParams.get("t") || "");
    if (!t) return json({ closed: true });
    return this.dinerReply(t, url.searchParams.get("d") || "", url, slug);
  }
  async dinerUpgrade(request, url) {
    if (request.headers.get("upgrade") !== "websocket") return err(426, "Se espera un WebSocket.");
    const t = this.tableByToken(url.searchParams.get("t") || "");
    if (!t) return err(404, "Mesa cerrada.");
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], ["diner", "t:" + t.ref]);
    pair[1].serializeAttachment({ diner: url.searchParams.get("d") || "" });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /* ---------- equipo (encargado) ---------- */
  async team(request) {
    const s = await this.session(request);
    if (!can(s.role, "users")) throw new CajaError("role", "Solo el encargado ve el equipo.");
    return json({
      users: this.sql.exec("SELECT id, name, role, locked_until > ? AS locked FROM users WHERE active = 1 ORDER BY name", Date.now()).toArray(),
      devices: this.sql.exec("SELECT substr(hash, 1, 8) AS id, name, created, seen, kind FROM devices ORDER BY seen DESC").toArray(),
    });
  }
  async teamChange(request, body, slug) {
    const s = await this.session(request);
    if (!can(s.role, "users")) throw new CajaError("role", "Solo el encargado cambia el equipo.");
    switch (body.action) {
      case "add": {
        const name = this.checkName(body.name), pin = this.checkPin(body.pin), role = ROLES.includes(body.role) ? body.role : "mozo", salt = randomToken(12);
        this.sql.exec("INSERT INTO users (name, role, salt, hash) VALUES (?, ?, ?, ?)", name, role, salt, await this.pinHash(salt, pin));
        break;
      }
      case "pin": {
        const pin = this.checkPin(body.pin), salt = randomToken(12);
        this.sql.exec("UPDATE users SET salt = ?, hash = ?, failed = 0, locked_until = 0 WHERE id = ?", salt, await this.pinHash(salt, pin), +body.id);
        break;
      }
      case "role":
        if (!ROLES.includes(body.role)) throw new CajaError("role", "Rol inválido.");
        if (+body.id === s.id && body.role !== "encargado") throw new CajaError("self", "No podés sacarte el rol de encargado a vos mismo.");
        this.sql.exec("UPDATE users SET role = ? WHERE id = ?", body.role, +body.id);
        break;
      case "remove":
        if (+body.id === s.id) throw new CajaError("self", "No podés borrarte a vos mismo.");
        this.sql.exec("UPDATE users SET active = 0 WHERE id = ?", +body.id);
        this.endSessions("user_id = ?", +body.id);
        break;
      case "deviceKind": {
        const kind = body.kind === "caja" ? "caja" : "";
        this.sql.exec("UPDATE devices SET kind = ? WHERE substr(hash, 1, 8) = ?", kind, String(body.id));
        this.broadcast({ t: "devices" });
        break;
      }
      case "unlinkDevice":
        this.endSessions("device IN (SELECT hash FROM devices WHERE substr(hash, 1, 8) = ?)", String(body.id));
        this.sql.exec("DELETE FROM devices WHERE substr(hash, 1, 8) = ?", String(body.id));
        break;
      case "newCode": {
        // the old code stops working; linked tablets stay linked
        const gen = +this.meta("code_gen", "0") + 1;
        this.setMeta("code_gen", gen);
        return json({ code: await restaurantCode(this.env.CAJA_SECRET, slug, gen) });
      }
      default: throw new CajaError("op", "Acción desconocida.");
    }
    return this.team(request);
  }

  // deletes sessions and closes their live connections (the socket tag is the session hash)
  endSessions(where, ...args) {
    for (const r of this.sql.exec(`SELECT hash FROM sessions WHERE ${where}`, ...args).toArray()) {
      for (const ws of this.ctx.getWebSockets(r.hash)) { try { ws.close(4001, "Sesión cerrada"); } catch { /* gone */ } }
    }
    this.sql.exec(`DELETE FROM sessions WHERE ${where}`, ...args);
  }

  /* ---------- en vivo ---------- */
  async wsTicket(request) {
    const s = await this.session(request);
    const t = randomToken(18);
    this.sql.exec("DELETE FROM tickets WHERE expires < ?", Date.now());
    this.sql.exec("INSERT INTO tickets (hash, session, expires) VALUES (?, ?, ?)", await sha256(t), s.hash, Date.now() + 30000);
    return json({ ticket: t });
  }
  async upgrade(request, url) {
    if (request.headers.get("upgrade") !== "websocket") return err(426, "Se espera un WebSocket.");
    const hash = await sha256(url.searchParams.get("t") || "");
    const t = this.sql.exec("SELECT session FROM tickets WHERE hash = ? AND expires > ?", hash, Date.now()).toArray()[0];
    this.sql.exec("DELETE FROM tickets WHERE hash = ?", hash); // single use
    if (!t) return err(401, "Ticket vencido.");
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], ["staff", t.session]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  webSocketMessage(ws, message) { if (message === "ping") ws.send("pong"); }
  webSocketClose(ws, code) { try { ws.close(code, "bye"); } catch { /* already closed */ } }
  // The caja tablet saves a PDF of each of these, whoever did the action (plan/pos: «todo registrado en la caja»).
  doc(kind, order, extra = {}) { this.broadcast({ t: "doc", kind, ref: order && order.ref, ...extra }); }
  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets("staff")) { try { ws.send(data); } catch { /* gone */ } }
  }
  pushToDiners(session) {
    for (const ws of this.ctx.getWebSockets("t:" + session.ref)) {
      try {
        const { diner } = ws.deserializeAttachment() || {};
        ws.send(JSON.stringify({ t: "mesa", view: dinerView(session, diner) }));
        if (isClosed(session)) ws.close(4000, "Mesa cerrada");
      } catch { /* gone */ }
    }
  }

  /* ---------- limpieza diaria ---------- */
  async alarm() {
    const limit = Date.now() - PII_DAYS * DAY;
    // closed sales 30 days after closing; orders that never closed, 30 days after they came in
    for (const r of this.sql.exec("SELECT data FROM orders WHERE ((closed IS NOT NULL AND closed < ?) OR (closed IS NULL AND created < ?)) AND data NOT LIKE '%\"piiWiped\":true%'", limit, limit).toArray()) {
      const o = { ...wipePii(JSON.parse(r.data)), piiWiped: true };
      this.sql.exec("UPDATE orders SET data = ? WHERE ref = ?", JSON.stringify(o), o.ref);
    }
    this.sql.exec("DELETE FROM sessions WHERE expires < ?", Date.now());
    this.sql.exec("DELETE FROM tickets WHERE expires < ?", Date.now());
    this.sql.exec("DELETE FROM drafts WHERE created < ?", Date.now() - DAY);
    await this.ctx.storage.setAlarm(Date.now() + DAY);
  }
}
