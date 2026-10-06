// Scene «El circuito completo»: one order, from the customer to the closing of the shift, in two cases:
// the customer at the bar (QR on the table) or at home (link + WhatsApp). Example data only; nothing is stored or sent.
// Contract: default export mount(root) -> { destroy }.
const CATALOG = {
  parrilla: [["Asado de tira", 68000], ["Vacío", 72000], ["Mandioca frita", 16000]],
  cafe: [["Café con leche", 14000], ["Medialuna", 8000], ["Tostado mixto", 22000]],
  lomo: [["Lomito árabe", 38000], ["Hamburguesa", 32000], ["Papas fritas", 18000]],
  bar: [["Cerveza", 18000], ["Tabla de picada", 85000], ["Hamburguesa", 32000]],
};
const Gs = (n) => "₲ " + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// [role, title, text, before]
const STEPS = {
  bar: [
    ["Cliente", "Escanea el QR de su mesa", "Abre tu menú con la cámara del celular. Ve fotos, precios y, si querés, el plato en 3D. No baja ninguna app.", "Antes: esperaba la carta y a que pase el mozo."],
    ["Cliente", "Arma su pedido y lo envía", "Elige los platos, agrega una nota («sin cebolla») y toca Enviar. Nadie tiene que anotar nada.", "Antes: el mozo lo anotaba en un papelito."],
    ["Mozo", "El mozo toma el pedido y elige la mesa", "El cliente le muestra en su celular el QR de su pedido. El mozo lo escanea con su celular o tablet, elige la mesa y listo.", "Antes: el papelito se perdía o se entendía mal."],
    ["Cocina", "La cocina ve qué preparar y para qué mesa", "El pedido le aparece en la pantalla de cocina: una tablet o un celular que ya tengas. Si querés, también sale impreso.", "Antes: el mozo gritaba o llevaba el papel."],
    ["Cocina y mozo", "Cocina toca «Listo» y el mozo se entera", "Cocina toca LISTO y el mozo lo ve en su pantalla. Lo lleva a la mesa.", "Antes: el mozo iba y volvía a preguntar."],
    ["Cuenta", "La cuenta se divide sin pelea", "Cada uno ve lo suyo, o se divide en partes iguales, con propina. La suma siempre cierra. El cobro lo hacés vos, como siempre.", "Antes: la calculadora y la discusión."],
    ["Dueño", "Cerrás el turno con todo en orden", "Resumen del día con PDF y CSV: pedidos y cómo se pagó cada cuenta. El cobro lo hacés vos, como siempre.", "Antes: sumar a mano al final de la noche."],
    ["Resultado", "Tu noche, antes y ahora", "Los mismos pasos de una noche, con papel y con Mesaverso Caja. Es el resumen de todo lo que viste.", "Caja está en prueba con locales piloto."],
  ],
  casa: [
    ["Cliente", "Abre tu link o tu QR", "Desde tu Instagram, tu WhatsApp o Google. Ve el menú con fotos y precios. No baja ninguna app.", "Antes: te escribía para preguntar qué había."],
    ["Cliente", "Arma el pedido: delivery o retiro", "Elige los platos, delivery o retiro, y deja su dirección si es delivery. Ve el total antes de enviar.", "Antes: te escribía todo a mano."],
    ["Cliente y local", "Te llega por WhatsApp, ya armado", "Recibís en tu WhatsApp un mensaje con los platos, el total, la dirección y un código #MV. Nadie lo tipea.", "Antes: mensajes sueltos y audios."],
    ["Local", "Queda anotado en Mesaverso Caja", "Cada pedido queda en tu panel de Mesaverso, con su código #MV, para que no se pierda ninguno.", "Antes: buscar el pedido entre cien mensajes."],
    ["Cocina y repartidor", "Se prepara y sale el repartidor", "Cocina prepara el pedido con todos los datos a la vista y el repartidor lo lleva.", "Antes: nadie sabía qué ya había salido."],
    ["Repartidor", "Cuando vuelve el repartidor, marcás que rindió", "Si el cliente pagó en efectivo, el repartidor te entrega la plata y lo marcás «Rendido». Ves de un vistazo cuánto falta rendir.", "Antes: cuentas en un cuaderno."],
    ["Dueño", "Cerrás el turno con todo en orden", "Resumen del día con PDF y CSV: pedidos y cómo se pagó cada cuenta. El cobro lo hacés vos, como siempre.", "Antes: sumar a mano al final de la noche."],
    ["Resultado", "Tu noche, antes y ahora", "Los mismos pasos de una noche, con papel y con Mesaverso Caja. Es el resumen de todo lo que viste.", "Caja está en prueba con locales piloto."],
  ],
};
const SHORT = { bar: ["Cliente", "Cliente", "Mozo", "Cocina", "Mozo", "Cuenta", "Vos", "Resumen"], casa: ["Cliente", "Cliente", "Vos", "Vos", "Cocina", "Repartidor", "Vos", "Resumen"] };
const OUT = {
  bar: ["Sin papelitos", "Sin gritos a cocina", "Cuenta sin pelea"],
  casa: ["Pedido armado, sin tipear", "Cada pedido con su código", "Rendición clara"],
};

export default function mount(root) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || (navigator.connection && navigator.connection.saveData);
  const rubro = () => document.documentElement.dataset.rubro || "parrilla";
  const local = () => document.documentElement.dataset.local || "Tu local";
  let mode = "bar", i = 0, playing = !reduce, timer = 0, visible = false;

  root.innerHTML = `
  <p class="cir__intro">Así viaja un pedido con <b>Mesaverso Caja</b>, desde que el cliente lo hace hasta que cerrás el turno. Vos cobrás como siempre: Mesaverso no cobra online ni emite factura.</p>
  <div class="cir__modes" role="group" aria-label="¿Cómo piden tus clientes?">
    <button type="button" class="cir__mode" data-m="bar" aria-pressed="true">Mis clientes comen en el local</button>
    <button type="button" class="cir__mode" data-m="casa" aria-pressed="false">Mis clientes piden por WhatsApp o delivery</button>
  </div>
  <ol class="cir__steps" id="ciStepsList"></ol>
  <div class="cir__main">
    <div class="cir__text" aria-live="polite">
      <span class="cir__role" id="ciRole"></span>
      <h3 id="ciTitle"></h3>
      <p id="ciText"></p>
      <p class="cir__before" id="ciBefore"></p>
      <div class="cir__ctl">
        <button type="button" class="btn btn--secondary btn--sm" id="ciPrev">Anterior</button>
        <button type="button" class="btn btn--primary btn--sm" id="ciNext">Siguiente</button>
        <button type="button" class="btn btn--secondary btn--sm" id="ciPlay"></button>
      </div>
    </div>
    <div class="cir__dev" id="ciDev" aria-hidden="true"></div>
  </div>
  <div class="cir__out"><ul id="ciOut"></ul><p class="cir__zero"><b>0 % de comisión en los pedidos que llegan por tu link o QR.</b></p>
    <a class="btn btn--primary" href="#cierre" id="ciCta">Quiero esto en mi local</a></div>
  <p class="fine">Es un local de ejemplo con pedidos inventados. Mesaverso Caja está en prueba con locales piloto, no emite factura y no cobra pagos online.</p>`;
  const $ = (s) => root.querySelector(s);
  const list = $("#ciStepsList"), dev = $("#ciDev");

  const rows = (counts) => CATALOG[rubro()].map(([n, p], k) => `<div class="row"><span class="row__ph">FOTO</span><div><b>${esc(n)}</b><small>${Gs(p)}</small></div><span class="add" data-n="${counts ? counts[k] : 0}">+</span></div>`).join("");
  const lines = () => { const d = CATALOG[rubro()]; return [[2, d[0][0], d[0][1] * 2], [1, d[1][0], d[1][1]]]; };
  const total = () => lines().reduce((a, l) => a + l[2], 0);
  const lineHtml = () => lines().map((l) => `<div class="m__ln"><span>${l[0]} × ${esc(l[1])}</span><span>${Gs(l[2])}</span></div>`).join("");

  // mock screens: [device, html]
  function mock(m, k) {
    const name = esc(local()), tot = Gs(total());
    const phone = (h) => ["phone", `<div class="panel">${h}</div>`];
    const tab = (title, h) => ["tab", `<div class="m__bar"><span>${title}</span><span>${name}</span></div>${h}`];
    const bar = (a, b) => `<div class="pbar"><span>${a}</span><span>${b}</span></div>`;
    if (k === 7) {
      const S = STEPS[m].slice(0, 7);
      return tab("Antes y ahora", `<div class="m__cmp"><b>Antes</b><b>Con Mesaverso Caja</b>${S.map((x) => `<p>${esc(x[3].replace("Antes: ", ""))}</p><p>${esc(x[1])}</p>`).join("")}</div>`);
    }
    if (k === 6) return tab("Cierre de turno", `<div class="m__card"><b>Resumen del turno</b><div class="m__ln"><span>Pedidos</span><span>1</span></div><div class="m__ln"><span>Ventas de esta demo</span><span>${tot}</span></div><div class="m__ln"><span>Registrado como</span><span>Efectivo</span></div></div><div class="m__btns"><span class="m__btn">Descargar PDF</span><span class="m__btn">Descargar CSV</span></div>`);
    if (m === "bar") {
      if (k === 0) return phone(`${bar(name, "Mesa 4")}<h4 class="ph1">Menú</h4>${rows(null)}<p class="hint">Abrió el QR de la mesa. Sin app.</p>`);
      if (k === 1) return phone(`${bar(name, "Mesa 4")}<h4 class="ph1">Tu pedido</h4>${rows([2, 1, 0])}<p class="hint">Nota: sin cebolla</p><span class="pcta">Enviar pedido · ${tot}</span>`);
      if (k === 2) return tab("Pantalla del mozo", `<div class="m__card m__card--new"><span class="pill">Nuevo · Mesa 4</span>${lineHtml()}<p class="hint">Lo hizo el cliente desde su celular. Nadie lo tipeó.</p></div><span class="m__btn m__btn--go">Aceptar pedido</span>`);
      if (k === 3) return tab("Cocina", `<div class="m__ticket"><div class="m__ln"><b>MESA 4</b><span>#0042</span></div><hr>${lines().map((l) => `<div>${l[0]} × ${esc(l[1])}</div>`).join("")}<hr><div>Nota: sin cebolla</div></div><span class="m__btn m__btn--go">Empezar</span>`);
      if (k === 4) return tab("Cocina y salón", `<div class="m__card"><div class="m__ln"><b>MESA 4 · #0042</b><span class="pill">Listo</span></div>${lineHtml()}</div><div class="m__toast">Mozo: la mesa 4 está lista para llevar</div>`);
      const d = CATALOG[rubro()], a = d[0][1], b = d[1][1];
      return phone(`${bar("Mesa 4", "Cuenta")}<h4 class="ph1">La cuenta</h4><div class="m__card"><div class="m__ln"><span>Total</span><b>${tot}</b></div></div><div class="m__ppl"><span><b>Ana</b>${Gs(a)}</span><span><b>Beto</b>${Gs(a)}</span><span><b>Cami</b>${Gs(b)}</span></div><p class="hint">Cada uno ve lo suyo. La suma cierra.</p>`);
    }
    if (k === 0) return phone(`${bar("Tu link o QR", name)}<h4 class="ph1">Menú</h4>${rows(null)}<p class="hint">Abrió tu link desde Instagram.</p>`);
    if (k === 1) return phone(`${bar(name, "Tu pedido")}${lineHtml()}<div class="m__seg"><span class="on">Delivery</span><span>Retiro</span></div><div class="m__fld">Dirección: Barrio Centro, calle ejemplo</div><div class="m__ln"><span>Envío</span><span>a confirmar</span></div><span class="pcta">Enviar por WhatsApp · ${tot}</span>`);
    if (k === 2) return ["phone", `<div class="panel"><div class="pbar"><span>WhatsApp de ${name}</span><span>ahora</span></div><div class="m__bubble"><b>Pedido de delivery</b>${lines().map((l) => `<div>${l[0]} × ${esc(l[1])}</div>`).join("")}<div>Total: ${tot} + envío</div><div>Dirección: Barrio Centro</div><div class="m__ref">Pedido #MV-0042 desde el menú digital</div></div></div>`];
    if (k === 3) return tab("Caja · Delivery", `<div class="m__card m__card--new"><div class="m__ln"><b>#MV-0042</b><span class="pill">Nuevo</span></div>${lineHtml()}</div><span class="m__btn m__btn--go">Anotado en la caja</span>`);
    if (k === 4) return tab("Caja · Delivery", `<div class="m__card"><div class="m__ln"><b>#MV-0042</b><span class="pill">En camino</span></div>${lineHtml()}<p class="hint">Repartidor: Juan (ejemplo)</p></div>`);
    return tab("Caja · Delivery", `<div class="m__card"><div class="m__ln"><b>#MV-0042</b><span class="pill">Rendido</span></div>${lineHtml()}</div><div class="m__card"><div class="m__ln"><b>#MV-0043</b><span class="pill">En la calle</span></div><p class="hint">Falta rendir</p></div>`);
  }

  function draw() {
    const S = STEPS[mode], [role, title, text, before] = S[i];
    list.innerHTML = S.map((s, k) => `<li><button type="button" class="cir__st${k === i ? " is-now" : ""}${k < i ? " is-done" : ""}" data-i="${k}" aria-label="Paso ${k + 1}: ${esc(s[1])}"${k === i ? ' aria-current="step"' : ""}><span class="cir__n">${k + 1}</span><span class="cir__r">${SHORT[mode][k]}</span></button></li>`).join("");
    $("#ciRole").textContent = role; $("#ciTitle").textContent = title; $("#ciText").textContent = text; $("#ciBefore").textContent = before;
    const [device, html] = mock(mode, i);
    dev.className = "cir__dev cir__dev--" + device;
    dev.innerHTML = device === "phone" ? `<div class="phone"><div class="screen">${html}</div></div>` : `<div class="tab"><div class="tab__screen">${html}</div></div>`;
    $("#ciOut").innerHTML = OUT[mode].map((t) => `<li>${esc(t)}</li>`).join("");
    root.querySelectorAll(".cir__mode").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === mode)));
    $("#ciPrev").disabled = i === 0; $("#ciNext").textContent = i === S.length - 1 ? "Volver al paso 1" : "Siguiente";
    $("#ciPlay").textContent = playing ? "Pausar" : "Reproducir";
    $(".cir__text").setAttribute("aria-live", playing ? "off" : "polite");
    list.style.setProperty("--p", i / (S.length - 1));
  }
  const go = (n, user) => { const L = STEPS[mode].length; i = (n + L) % L; if (user) { playing = false; clearTimer(); } draw(); };
  const clearTimer = () => { clearInterval(timer); timer = 0; };
  const startTimer = () => { if (!timer && playing && visible && !document.hidden) timer = setInterval(() => go(i + 1, false), 6500); };
  root.addEventListener("click", (e) => {
    const m = e.target.closest(".cir__mode"), st = e.target.closest(".cir__st");
    if (m) { mode = m.dataset.m; i = 0; draw(); if (playing) { clearTimer(); startTimer(); } }
    else if (st) go(+st.dataset.i, true);
    else if (e.target.id === "ciPrev") go(i - 1, true);
    else if (e.target.id === "ciNext") go(i + 1, true);
    else if (e.target.id === "ciPlay") { playing = !playing; clearTimer(); startTimer(); draw(); }
  });
  const onLocal = () => draw(); document.addEventListener("mv-local", onLocal);
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; document.documentElement.toggleAttribute("data-ci-view", visible); clearTimer(); if (visible) startTimer(); }, { threshold: 0.15 });
  io.observe(root);
  draw();
  return { destroy() { clearTimer(); io.disconnect(); document.documentElement.removeAttribute("data-ci-view"); document.removeEventListener("mv-local", onLocal); } };
}
