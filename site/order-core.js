// Order logic shared by the menu page (inlined by build.mjs as a classic script) and the tests
// (site/order-core.test.mjs). No DOM here: prices, option picks, opening hours and the WhatsApp text.
const OrderCore = (() => {
  const TZ = "America/Asuncion";
  const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const DAY_NAMES = { sun: "domingo", mon: "lunes", tue: "martes", wed: "miércoles", thu: "jueves", fri: "viernes", sat: "sábado" };
  const PAYMENT_LABEL = { efectivo: "Efectivo", transferencia: "Transferencia", qr: "QR", tarjeta: "Tarjeta (POS al recibir)" };
  const TYPE_LABEL = { delivery: "Delivery", pickup: "Retiro en el local" };

  const money = n => "₲ " + Math.round(n || 0).toLocaleString("es-PY");
  const toMin = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "").trim()); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };

  // Accepts both the old seed shape (choices: ["Frutilla", ...]) and the new one (items: [{ name, price }]).
  function normalizeOptions(options) {
    return (options || []).map(o => {
      const items = (o.items && o.items.length ? o.items : (o.choices || []).map(name => ({ name })))
        .filter(i => i && i.name)
        .map(i => ({ name: String(i.name), price: Math.max(0, Math.round(Number(i.price) || 0)) }));
      const multiple = !!o.multiple;
      // old data has no `required`: a single-choice group was always "pick one"
      const required = o.required == null ? !multiple : !!o.required;
      return { group: String(o.group || ""), multiple, required, items };
    }).filter(o => o.items.length);
  }

  // picks: one array of item indexes per option group, e.g. [[0], [1, 2]]
  function cleanPicks(dish, picks) {
    const opts = dish.options || [];
    return opts.map((o, gi) => {
      const raw = Array.isArray(picks && picks[gi]) ? picks[gi] : [];
      const ok = [...new Set(raw.filter(i => Number.isInteger(i) && i >= 0 && i < o.items.length))].sort((a, b) => a - b);
      return o.multiple ? ok : ok.slice(0, 1);
    });
  }
  const missingGroups = (dish, picks) => (dish.options || []).map((o, gi) => (o.required && !(picks[gi] || []).length ? gi : -1)).filter(gi => gi >= 0);
  const unitPrice = (dish, picks) => (dish.options || []).reduce((sum, o, gi) => sum + (picks[gi] || []).reduce((s, i) => s + o.items[i].price, 0), dish.price || 0);
  const describePicks = (dish, picks) => (dish.options || []).flatMap((o, gi) => (picks[gi] || []).map(i => o.items[i].name));
  const lineKey = (slug, picks, note) => slug + "|" + JSON.stringify(picks) + "|" + String(note || "").trim().toLowerCase();

  // Keeps only lines that still make sense after the menu was republished (dish gone, sold out, options changed).
  function restoreLines(saved, bySlug) {
    const out = [];
    for (const l of Array.isArray(saved) ? saved : []) {
      const d = l && bySlug[l.slug];
      if (!d || d.soldOut || !(l.n > 0)) continue;
      const picks = cleanPicks(d, l.picks);
      if (missingGroups(d, picks).length || JSON.stringify(picks) !== JSON.stringify(l.picks || picks)) continue;
      const note = String(l.note || "").slice(0, 140);
      out.push({ k: lineKey(l.slug, picks, note), slug: l.slug, picks, note, n: Math.min(Math.round(l.n), 20) });
    }
    return out;
  }

  // "Now" in Asunción, whatever the phone's time zone is.
  function localNow(date = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date).map(p => [p.type, p.value]));
    return { day: DAY_KEYS.indexOf(parts.weekday.toLowerCase().slice(0, 3)), min: (+parts.hour % 24) * 60 + +parts.minute };
  }

  // hours: [{ days: ["mon", ...], open: "18:00", close: "23:30" }]; a close before the open time ends after midnight.
  // Returns null when the restaurant has no hours (always open), else { open, until?, next? }.
  function openState(hours, date = new Date()) {
    const ranges = [];
    for (const h of hours || []) {
      const o = toMin(h.open), c = toMin(h.close);
      if (o == null || c == null) continue;
      for (const key of h.days || []) {
        const day = DAY_KEYS.indexOf(key);
        if (day < 0) continue;
        const start = day * 1440 + o, end = day * 1440 + (c > o ? c : c + 1440);
        ranges.push([start, end], [start - 7 * 1440, end - 7 * 1440]); // the copy a week back covers Saturday night → Sunday
      }
    }
    if (!ranges.length) return null;
    const { day, min } = localNow(date);
    const now = day * 1440 + min;
    const hhmm = m => String(Math.floor((m % 1440) / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
    const cur = ranges.find(([s, e]) => s <= now && now < e);
    if (cur) return { open: true, until: hhmm(cur[1]) };
    const next = ranges.map(([s]) => (s > now ? s : s + 7 * 1440)).filter(s => s > now).sort((a, b) => a - b)[0];
    const days = Math.floor(next / 1440) - day;
    const when = days === 0 ? "hoy" : days === 1 ? "mañana" : "el " + DAY_NAMES[DAY_KEYS[Math.floor(next / 1440) % 7]];
    return { open: false, next: `${when} a las ${hhmm(next)}` };
  }

  // The menu's ordering settings with defaults, so a restaurant without them still gets a usable checkout.
  function orderingConfig(cfg) {
    const c = cfg || {};
    const types = (c.orderTypes || []).filter(t => TYPE_LABEL[t]);
    const payments = (c.paymentMethods || []).filter(p => PAYMENT_LABEL[p]);
    return {
      orderTypes: types.length ? types : ["delivery", "pickup"],
      paymentMethods: payments.length ? payments : ["efectivo", "transferencia"],
      deliveryFee: c.deliveryFee == null || c.deliveryFee === "" ? null : Math.max(0, Math.round(+c.deliveryFee || 0)),
      zones: (c.deliveryZones || []).filter(z => z && z.name).map(z => ({ name: String(z.name), fee: Math.max(0, Math.round(+z.fee || 0)) })),
      minOrder: Math.max(0, Math.round(+c.minOrder || 0)),
      transferInfo: String(c.transferInfo || "").trim(),
      hours: c.hours || [],
    };
  }

  // Delivery fee for the chosen zone: a number, or null when the restaurant confirms it by chat.
  function deliveryFee(cfg, form) {
    if (form.type !== "delivery") return 0;
    if (cfg.zones.length) { const z = cfg.zones[form.zone]; return z ? z.fee : null; }
    return cfg.deliveryFee;
  }

  // Field id → error message; empty object when the order can be sent.
  function checkoutErrors(cfg, form, subtotal) {
    const e = {};
    if (!cfg.orderTypes.includes(form.type)) e.type = "Elegí delivery o retiro.";
    if (!String(form.name || "").trim()) e.name = "Escribí tu nombre.";
    if (form.type === "delivery") {
      if (!String(form.address || "").trim()) e.address = "Escribí la dirección de entrega.";
      if (cfg.zones.length && !cfg.zones[form.zone]) e.zone = "Elegí tu zona.";
      if (cfg.minOrder && subtotal < cfg.minOrder) e.type = `El pedido mínimo para delivery es ${money(cfg.minOrder)}. Te faltan ${money(cfg.minOrder - subtotal)}.`;
    }
    if (!cfg.paymentMethods.includes(form.payment)) e.payment = "Elegí cómo vas a pagar.";
    if (form.payment === "efectivo" && form.cash) {
      const total = subtotal + (deliveryFee(cfg, form) || 0);
      if (Math.round(+form.cash) < total) e.cash = `Tiene que ser al menos ${money(total)}.`;
    }
    return e;
  }

  function lineText(line, d) {
    const extras = describePicks(d, line.picks);
    const unit = unitPrice(d, line.picks);
    return [`• ${line.n} × ${d.name}${extras.length ? " (" + extras.join(", ") + ")" : ""} — ${money(unit * line.n)}`,
      ...(line.note ? [`   _Aclaración: ${line.note}_`] : [])];
  }

  // The WhatsApp message. `form` is null for a table order (the diner is in the restaurant).
  function orderMessage({ restaurant, lines, bySlug, table, cfg, form }) {
    const subtotal = lines.reduce((s, l) => s + unitPrice(bySlug[l.slug], l.picks) * l.n, 0);
    const out = [`¡Hola ${restaurant}! Quiero hacer este pedido:`, "", ...lines.flatMap(l => lineText(l, bySlug[l.slug]))];
    if (table || !form) {
      out.push("", `*Total: ${money(subtotal)}*`);
      if (table) out.push(`Mesa ${table}`);
    } else {
      const fee = deliveryFee(cfg, form);
      out.push("", `Subtotal: ${money(subtotal)}`);
      if (form.type === "delivery") out.push(`Envío${cfg.zones[form.zone] ? " (" + cfg.zones[form.zone].name + ")" : ""}: ${fee == null ? "a confirmar" : money(fee)}`);
      out.push(`*Total: ${money(subtotal + (fee || 0))}${fee == null ? " + envío" : ""}*`, "",
        `*${TYPE_LABEL[form.type]}*`, `Nombre: ${String(form.name).trim()}`);
      if (form.type === "delivery") {
        out.push(`Dirección: ${String(form.address).trim()}`);
        if (String(form.reference || "").trim()) out.push(`Referencia: ${String(form.reference).trim()}`);
      }
      let pay = `Pago: ${PAYMENT_LABEL[form.payment]}`;
      if (form.payment === "efectivo" && form.cash) pay += ` (pago con ${money(+form.cash)})`;
      out.push(pay);
      if (String(form.note || "").trim()) out.push(`Nota: ${String(form.note).trim()}`);
    }
    out.push("", "Pedido desde el menú digital #MV");
    return out.join("\n");
  }

  return { PAYMENT_LABEL, TYPE_LABEL, money, normalizeOptions, cleanPicks, missingGroups, unitPrice, describePicks, lineKey,
    restoreLines, openState, orderingConfig, deliveryFee, checkoutErrors, orderMessage };
})();
