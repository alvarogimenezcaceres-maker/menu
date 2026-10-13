// Demo of /comedores/: an employee builds an order and sees the WhatsApp message the comedor would receive.
// Everything runs in the browser (nothing is sent or stored); the only network action is opening wa.me when the button is tapped.
// The message mirrors the one the real Gratis menu writes (site/order-core.js, orderMessage with basic: true).
const Gs = (n) => "₲ " + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const NAME = "Comedor de ejemplo";
const GARNISH = [["Sin guarnición", 0], ["Arroz primavera", 0], ["Espagueti al pesto", 0], ["Verduras salteadas", 0], ["Ensalada de repollo (+₲ 2.000)", 2000], ["Puré de papas (+₲ 5.000)", 5000]];
const DISHES = [
  { name: "Milanesa", types: [["Pollo", 21000], ["Lomo simple", 25000], ["Lomo a caballo", 27000], ["Napolitana", 27000]], garnish: true },
  { name: "Bife de lomo", types: [["Simple", 25000], ["A caballo", 27000]], garnish: true },
  { name: "Costeleta de cerdo a la plancha", price: 23000, garnish: true },
  { name: "Guiso de chorizo con fideo", price: 17000 },
  { name: "Tarta de pollo con acelga", price: 19000 },
];
const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ref = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join("");

const menu = document.getElementById("lpMenu"), linesEl = document.getElementById("lpLines"), totalEl = document.getElementById("lpTotal"), msgEl = document.getElementById("lpMsg"), send = document.getElementById("lpSend");
if (menu && linesEl && totalEl && msgEl && send) {
  const order = []; // { key, name, extras: [..], unit, n }
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const select = (id, label, items) => {
    const wrap = el("label"); wrap.append(el("span", null, label));
    const s = el("select", "in"); s.id = id;
    items.forEach(([t], i) => { const o = el("option", null, t); o.value = String(i); s.append(o); });
    wrap.append(s); return { wrap, s };
  };

  DISHES.forEach((d, di) => {
    const card = el("div", "lp-dish");
    const head = el("div", "lp-dish__h"); const nameEl = el("b", null, d.name); const price = el("span", "lp-dish__p");
    head.append(nameEl, price); card.append(head);
    const opts = el("div", "lp-dish__opts");
    const t = d.types ? select(`lpT${di}`, "Tipo", d.types) : null;
    const g = d.garnish ? select(`lpG${di}`, "Guarnición", GARNISH) : null;
    const unit = () => (d.types ? d.types[+t.s.value][1] : d.price) + (g ? GARNISH[+g.s.value][1] : 0);
    const showPrice = () => { price.textContent = Gs(unit()); };
    [t, g].filter(Boolean).forEach((x) => { opts.append(x.wrap); x.s.addEventListener("change", showPrice); });
    const add = el("button", "btn btn--secondary", "Agregar"); add.type = "button";
    add.addEventListener("click", () => {
      const extras = [t && d.types[+t.s.value][0], g && +g.s.value > 0 && GARNISH[+g.s.value][0].replace(/ \(\+.*\)$/, "")].filter(Boolean);
      const key = d.name + "|" + extras.join(",");
      const found = order.find((x) => x.key === key);
      if (found) found.n += 1; else order.push({ key, name: d.name, extras, unit: unit(), n: 1 });
      paint();
    });
    showPrice(); opts.append(add); card.append(opts); menu.append(card);
  });

  function paint() {
    linesEl.replaceChildren();
    if (!order.length) linesEl.append(el("li", "is-empty", "Todavía no agregaste nada."));
    order.forEach((l, i) => {
      const li = el("li", "lp-demo__line");
      li.append(el("span", null, `${l.n} × ${l.name}${l.extras.length ? " (" + l.extras.join(", ") + ")" : ""} — ${Gs(l.unit * l.n)}`));
      const mk = (txt, label, fn) => { const b = el("button", "lp-demo__q", txt); b.type = "button"; b.setAttribute("aria-label", label); b.addEventListener("click", fn); return b; };
      li.append(mk("−", "Quitar uno de " + l.name, () => { l.n -= 1; if (l.n <= 0) order.splice(i, 1); paint(); }), mk("+", "Sumar uno de " + l.name, () => { l.n += 1; paint(); }));
      linesEl.append(li);
    });
    const total = order.reduce((s, l) => s + l.unit * l.n, 0);
    totalEl.textContent = Gs(total);
    const text = order.length
      ? [`¡Hola ${NAME}! Quiero hacer este pedido:`, "", ...order.map((l) => `• ${l.n} × ${l.name}${l.extras.length ? " (" + l.extras.join(", ") + ")" : ""} — ${Gs(l.unit * l.n)}`), "", `Total: ${Gs(total)}`, "", "Te paso por acá si es delivery o retiro, mi nombre y cómo pago.", "", `Pedido #MV-${ref} desde el menú digital`].join("\n")
      : "Cuando agregues un plato, acá aparece el mensaje que le llega al comedor.";
    msgEl.textContent = text;
    if (order.length) { send.href = "https://wa.me/?text=" + encodeURIComponent(text); send.setAttribute("aria-disabled", "false"); }
    else { send.href = "https://wa.me/"; send.setAttribute("aria-disabled", "true"); }
  }
  send.addEventListener("click", (e) => { if (send.getAttribute("aria-disabled") === "true") e.preventDefault(); });
  paint();
}
