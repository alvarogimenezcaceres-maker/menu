// Kitchen tickets for Mesaverso Caja: comanda, precuenta and ticket as lines of an 80 mm paper roll, and a tiny PDF
// writer (Courier, one page as long as the ticket). No libraries: the caja page inlines this file (build.mjs) and the
// tests run it with vm (site/ticket-core.test.mjs). The same lines will feed a thermal printer later (ESC/POS).
const Ticket = (() => {
  const WIDTH = 32; // characters per line on 80 mm paper at 10 pt Courier
  const PAY = { efectivo: "Efectivo", transferencia: "Transferencia", qr: "QR", tarjeta: "Tarjeta", mixto: "Varias formas" };
  const COLOR = { azul: "Azul", verde: "Verde", naranja: "Naranja", violeta: "Violeta", rosa: "Rosa", celeste: "Celeste", amarillo: "Amarillo", rojo: "Rojo" };
  const gs = n => "Gs. " + Math.round(n || 0).toLocaleString("es-PY");
  const hhmm = t => new Date(t).toLocaleString("es-PY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Asuncion" });

  // word wrap to the paper width; `indent` spaces on the following lines
  function wrap(text, width = WIDTH, indent = 0) {
    const out = [], pad = " ".repeat(Math.min(indent, width - 4));
    let line = "";
    for (const word of String(text).split(/\s+/).filter(Boolean)) {
      if (!line) line = (out.length ? pad : "") + word;
      else if ((line + " " + word).length <= width) line += " " + word;
      else { out.push(line); line = pad + word; }
      // a single word longer than the paper is cut
      while (line.length > width) { out.push(line.slice(0, width)); line = pad + line.slice(width); }
    }
    if (line.trim()) out.push(line);
    return out.length ? out : [""];
  }
  const L = (text, opt = {}) => ({ text, big: !!opt.big, bold: !!opt.bold, center: !!opt.center });
  const rule = () => L("-".repeat(WIDTH));
  const twoCols = (left, right, width = WIDTH) => {
    const r = String(right), room = width - r.length - 1;
    const lefts = wrap(left, room);
    return lefts.map((t, i) => L(i === lefts.length - 1 ? t.padEnd(room) + " " + r : t));
  };
  const who = l => (l.diner ? " [" + (COLOR[l.diner] || l.diner) + "]" : "");

  // The kitchen copy: big header (table or delivery), items in capitals, options and notes under each one. No prices.
  function comanda(o, { restaurant, by, lines } = {}) {
    const items = lines || o.lines;
    const head = o.kind === "table" ? `MESA ${o.table}` : o.type === "delivery" ? "DELIVERY" : "RETIRO";
    const out = [L(restaurant || "", { center: true }), L("COMANDA", { bold: true, center: true }), L(head, { big: true, center: true })];
    out.push(L([o.kind === "table" ? "" : "#MV-" + o.ref, hhmm(Date.now()), by || ""].filter(Boolean).join(" · "), { center: true }));
    if (o.kind !== "table" && o.name) out.push(L(o.name, { center: true }));
    out.push(rule());
    for (const l of items) {
      wrap(`${l.n}x ${String(l.name).toUpperCase()}${who(l)}`, WIDTH, 3).forEach(t => out.push(L(t, { bold: true })));
      if (l.extras && l.extras.length) wrap(l.extras.join(", "), WIDTH, 3).forEach(t => out.push(L("   " + t.trimStart())));
      if (l.note) wrap(`** ${l.note.toUpperCase()} **`, WIDTH, 3).forEach(t => out.push(L("   " + t.trimStart(), { bold: true })));
    }
    out.push(rule());
    if (o.kind !== "table" && o.note) wrap("Nota: " + o.note).forEach(t => out.push(L(t)));
    out.push(L(`${items.reduce((a, l) => a + l.n, 0)} ítems`, { center: true }));
    return out;
  }

  const priced = l => twoCols(`${l.n}x ${l.name}${who(l)}`, gs(l.unit * l.n));
  const footer = () => [rule(), L("No válido como factura", { center: true }), L("Mesaverso", { center: true })];

  // Before paying: every line with its price, by diner when the bill was split.
  function precuenta(t, { restaurant } = {}) {
    const out = [L(restaurant || "", { bold: true, center: true }), L("PRECUENTA", { bold: true, center: true }), L(`MESA ${t.table}`, { big: true, center: true }), L(hhmm(Date.now()), { center: true }), rule()];
    t.lines.forEach(l => out.push(...priced(l)));
    out.push(rule(), ...twoCols("TOTAL", gs(t.lines.reduce((a, l) => a + l.unit * l.n, 0))).map(x => ({ ...x, bold: true })));
    if (t.bill) {
      out.push(rule(), L("Cuenta dividida", { bold: true }));
      for (const p of t.bill.parts) out.push(...twoCols(p.color ? COLOR[p.color] || p.color : "Persona " + p.key.slice(1), gs(p.pay)));
      if (t.bill.tip) out.push(L(`Incluye propina ${gs(t.bill.tip)}`));
    }
    return [...out, ...footer()];
  }

  // After paying: a whole order or table, or one part of a split bill.
  function ticket(o, { restaurant, part } = {}) {
    const title = o.kind === "table" ? `MESA ${o.table}` : "#MV-" + o.ref;
    const out = [L(restaurant || "", { bold: true, center: true }), L("TICKET", { bold: true, center: true }), L(title, { big: true, center: true }), L(hhmm(Date.now()), { center: true }), rule()];
    if (part) {
      out.push(L(part.color ? COLOR[part.color] || part.color : "Persona " + part.key.slice(1), { bold: true }));
      for (const i of part.items || []) out.push(...twoCols(`${i.n}x ${i.name}${i.shared > 1 ? ` (1/${i.shared})` : ""}`, gs(i.amount)));
      out.push(rule(), ...twoCols("Consumo", gs(part.amount)));
      if (part.tip) out.push(...twoCols("Propina", gs(part.tip)));
      out.push(...twoCols("TOTAL", gs(part.pay)).map(x => ({ ...x, bold: true })));
      if (part.method) out.push(L("Pago: " + (PAY[part.method] || part.method)));
    } else {
      o.lines.forEach(l => out.push(...priced(l)));
      out.push(rule());
      if (o.fee) out.push(...twoCols("Envío", gs(o.fee)));
      const tip = o.bill ? o.bill.tip : 0;
      if (tip) out.push(...twoCols("Propina", gs(tip)));
      out.push(...twoCols("TOTAL", gs(o.lines.reduce((a, l) => a + l.unit * l.n, 0) + (o.fee || 0) + tip)).map(x => ({ ...x, bold: true })));
      if (o.payMethod) out.push(L("Pago: " + (PAY[o.payMethod] || o.payMethod)));
    }
    return [...out, ...footer()];
  }

  // End of shift: sales by payment method, tips apart, cancellations and what was still pending.
  function resumen(sum, { restaurant, openedBy, closedBy } = {}) {
    const out = [L(restaurant || "", { bold: true, center: true }), L("CIERRE DE TURNO", { bold: true, center: true }),
      L(`${hhmm(sum.since || sum.until)} a ${hhmm(sum.until)}`, { center: true })];
    if (openedBy || closedBy) out.push(L([openedBy && "Abrió " + openedBy, closedBy && "cerró " + closedBy].filter(Boolean).join(", "), { center: true }));
    out.push(rule(), L(`Ventas cerradas: ${sum.count}`, { bold: true }), L(`${sum.tables} ${sum.tables === 1 ? "mesa" : "mesas"} · ${sum.orders} ${sum.orders === 1 ? "pedido" : "pedidos"}`), rule());
    for (const [m, v] of Object.entries(sum.byMethod)) out.push(...twoCols(PAY[m] || m, gs(v)));
    out.push(rule(), ...twoCols("TOTAL VENDIDO", gs(sum.sales)).map(x => ({ ...x, bold: true })));
    if (sum.fees) out.push(L(`(incluye envíos ${gs(sum.fees)})`));
    out.push(...twoCols("Propinas (aparte)", gs(sum.tips)));
    if (sum.cancelled.length) {
      out.push(rule(), L(`Cancelados: ${sum.cancelled.length}`, { bold: true }));
      for (const c of sum.cancelled) wrap(`${c.label} · ${gs(c.amount)} · ${c.reason}`, WIDTH, 2).forEach(t => out.push(L(t)));
    }
    const p = sum.pending;
    if (p.unpaid || p.openTables || Object.keys(p.street).length) {
      out.push(rule(), L("Pendiente al cerrar", { bold: true }));
      if (p.unpaid) out.push(...twoCols(`Pedidos sin cobrar (${p.unpaid})`, gs(p.unpaidTotal)));
      for (const [r, v] of Object.entries(p.street)) out.push(...twoCols(`Efectivo con ${r}`, gs(v)));
      if (p.openTables) out.push(...twoCols(`Mesas abiertas (${p.openTables})`, gs(p.openTablesTotal)));
    }
    return [...out, rule(), L("Mesaverso", { center: true })];
  }

  /* ---------- PDF ---------- */
  // Courier is a PDF base font: no embedding. Text goes as Windows-1252; ₲ and other signs outside it are replaced.
  const CP1252 = { "€": 128, "‚": 130, "„": 132, "…": 133, "–": 150, "—": 151, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149 };
  function latin1(s) {
    let out = "";
    for (const ch of String(s).replace(/₲/g, "Gs.")) {
      const c = ch.codePointAt(0);
      out += c < 128 || (c >= 160 && c < 256) ? ch : CP1252[ch] ? String.fromCharCode(CP1252[ch]) : "?";
    }
    return out.replace(/[\\()]/g, m => "\\" + m);
  }
  function pdf(lines) {
    const W = 226.77, M = 10, size = l => (l.big ? 18 : 10), lh = l => size(l) * 1.3; // 80 mm wide
    const H = Math.max(120, Math.ceil(M * 2 + lines.reduce((a, l) => a + lh(l), 0)));
    let y = H - M, body = "BT\n";
    for (const l of lines) {
      y -= lh(l);
      const text = latin1(l.text), w = [...String(l.text).replace(/₲/g, "Gs.")].length * size(l) * 0.6;
      const x = l.center ? Math.max(M, (W - w) / 2) : M;
      body += `/${l.bold || l.big ? "F2" : "F1"} ${size(l)} Tf 1 0 0 1 ${x.toFixed(2)} ${(y + 2).toFixed(2)} Tm (${text}) Tj\n`;
    }
    body += "ET";
    const objs = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
      `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>",
    ];
    let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("")}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return bytes;
  }
  const plainText = lines => lines.map(l => (l.center ? l.text.padStart(Math.floor((WIDTH + l.text.length) / 2)) : l.text)).join("\n");

  return { WIDTH, wrap, comanda, precuenta, ticket, resumen, pdf, plainText };
})();
globalThis.Ticket = Ticket;
