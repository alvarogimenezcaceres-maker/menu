// Scene «En vivo»: the customer's phone and the kitchen screen side by side, linked in real time.
// Example data only; nothing is stored or sent. Contract: default export mount(root) -> { destroy }.
const CATALOG = {
  parrilla: [["Asado de tira", 68000], ["Vacío", 72000], ["Mandioca frita", 16000]],
  cafe: [["Café con leche", 14000], ["Medialuna", 8000], ["Tostado mixto", 22000]],
  lomo: [["Lomito árabe", 38000], ["Hamburguesa", 32000], ["Papas fritas", 18000]],
  bar: [["Cerveza", 18000], ["Tabla de picada", 85000], ["Hamburguesa", 32000]],
};
const Gs = (n) => "₲ " + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const STATUS = ["Enviado a la cocina", "En cocina: lo están preparando", "Listo: el mozo lo lleva a tu mesa"];
const SAY = [
  "Tocá el + en el celular del cliente y mandá un pedido.",
  "Mirá la pantalla de cocina: el pedido llegó solo, sin papelito. Tocá «Empezar».",
  "El cliente ya ve que lo están preparando. Ahora tocá «Listo».",
  "Listo: el mozo se entera al instante y el pedido suma a la cuenta de la mesa.",
];
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };

export default function mount(root) {
  const rubro = () => document.documentElement.dataset.rubro || "parrilla";
  const local = () => document.documentElement.dataset.local || "";
  let cart = [0, 0, 0], orders = [], seq = 41, phase = 0;
  root.innerHTML = `<div class="live__phone"><div class="phone"><div class="screen" id="lvPhone"></div></div></div>
    <div class="live__kds"><div class="kds" aria-label="Pantalla de cocina"><div class="kds__bar"><span>Cocina</span><span id="lvCount"></span></div><div class="kds__list" id="lvList"></div></div>
    <p class="live__say" id="lvSay" aria-live="polite"></p>
    <div><button type="button" class="btn btn--secondary btn--sm" id="lvReset">Empezar de nuevo</button></div>
    <p class="fine">Local de ejemplo con pedidos de mentira. Nada se guarda ni se envía.</p></div>`;
  const phone = root.querySelector("#lvPhone"), list = root.querySelector("#lvList"), say = root.querySelector("#lvSay"), count = root.querySelector("#lvCount");
  const dishes = () => CATALOG[rubro()] || CATALOG.parrilla;
  const total = () => dishes().reduce((a, d, i) => a + d[1] * cart[i], 0);
  const last = () => orders[orders.length - 1];

  function drawPhone() {
    const p = el("div", "panel");
    const bar = el("div", "pbar"); bar.append(el("span", null, local() || "Tu local"), el("span", null, "Mesa 4"));
    p.append(bar, el("h3", "ph1", "Menú"));
    dishes().forEach(([n, pr], i) => {
      const row = el("div", "row"), info = el("div"); info.append(el("b", null, n), el("small", null, Gs(pr)));
      const b = el("button", "add", "+"); b.type = "button"; b.dataset.n = String(cart[i]); b.setAttribute("aria-label", "Agregar " + n + (cart[i] ? ", hay " + cart[i] : ""));
      b.onclick = () => { cart[i]++; if (phase === 3) phase = 0; drawPhone(); phone.querySelectorAll(".add")[i].focus(); };
      row.append(el("span", "row__ph", "FOTO"), info, b); p.append(row);
    });
    const o = last();
    if (o) { const st = el("div", "pcard"); st.append(el("span", "pill", "Pedido #" + o.id), el("b", null, STATUS[o.s])); p.append(st); }
    const cnt = cart.reduce((a, b) => a + b, 0);
    const cta = el("button", "pcta", cnt ? "Enviar pedido · " + Gs(total()) : "Enviar pedido"); cta.type = "button"; cta.disabled = !cnt;
    cta.onclick = () => { orders.push({ id: ++seq, lines: dishes().map((d, i) => cart[i] ? [cart[i], d[0]] : null).filter(Boolean), s: 0 }); cart = [0, 0, 0]; phase = 1; drawAll(); focusKds(); };
    p.append(cta); phone.replaceChildren(p);
  }
  function drawKds() {
    list.replaceChildren(); count.textContent = orders.length ? orders.length + (orders.length === 1 ? " pedido" : " pedidos") : "Sin pedidos";
    if (!orders.length) list.append(el("p", "kds__empty", "Todavía no llegó ningún pedido. Cuando el cliente lo envíe, aparece acá."));
    orders.slice(-3).reverse().forEach((o) => {
      const c = el("div", "kds__card s" + o.s), h = el("div", "kds__h"); h.append(el("b", null, "MESA 4"), el("span", null, "#" + o.id));
      const ul = el("ul"); o.lines.forEach(([q, n]) => ul.append(el("li", null, q + " × " + n)));
      c.append(h, ul);
      if (o.s < 2) { const b = el("button", "btn btn--primary btn--sm", o.s === 0 ? "Empezar" : "Listo"); b.type = "button"; b.onclick = () => { o.s++; phase = o.s + 1; drawAll(); }; c.append(b); }
      else c.append(el("span", "kds__done", "Listo · el mozo ya lo sabe"));
      list.append(c);
    });
  }
  function drawAll() { drawPhone(); drawKds(); say.textContent = SAY[Math.min(phase, 3)]; }
  const focusKds = () => { const b = list.querySelector("button"); if (b && matchMedia("(min-width:900px)").matches) b.focus({ preventScroll: true }); };
  root.querySelector("#lvReset").onclick = () => { cart = [0, 0, 0]; orders = []; seq = 41; phase = 0; drawAll(); };
  const onLocal = () => { drawPhone(); };
  document.addEventListener("mv-local", onLocal);
  drawAll();
  return { destroy() { document.removeEventListener("mv-local", onLocal); } };
}
