// Scene «La noche»: a 24 h dial the visitor operates. One deterministic example night (no network, no storage, no Date).
// Contract: default export mount(root) -> { destroy }. Loaded with import() when the section nears the viewport.
const SVGNS = "http://www.w3.org/2000/svg";
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || (navigator.connection && navigator.connection.saveData);
const DISHES = ["Lomito árabe", "Milanesa con puré", "Torta de zanahoria", "Jugo de naranja", "Pizza muzzarella", "Cerveza", "Empanadas"];
const STAGES = [
  ["Recibido", "El pedido llegó desde el QR de la mesa. Ya está en la pantalla del salón."],
  ["En cocina", "La cocina vio la comanda. No hay papelito que se pierda."],
  ["Listo", "La cocina lo marcó listo y el mozo se enteró al instante."],
  ["En la cuenta", "El pedido ya suma en la cuenta de la mesa, lista para dividir."],
];
// Story beats for the scroll mode: [minute, stage of the latest order (or null), sentence].
const BEATS = [
  [1140, null, "Abrís el local. Bajá despacio: la noche se va llenando sola."],
  [1215, 0, "Entra un pedido. Lo hizo el cliente desde el QR de su mesa, sin papelito."],
  [1250, 1, "La cocina ve la comanda en su pantalla."],
  [1290, 2, "Listo: la cocina lo marca y el mozo se entera al instante."],
  [1330, 3, "El pedido ya suma en la cuenta de la mesa."],
  [1385, null, "A la hora de pagar, cada uno ve lo suyo y la cuenta se divide sin pelea."],
  [1425, null, "Cerrás el turno con el resumen del día. 0 % de comisión en los pedidos que llegan por tu link o QR."],
];
const RINGS = [232, 214, 196, 178, 160, 142];

// Example night: ~210 orders, busiest around 21 h. Pure function of a fixed seed.
function makeNight() {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const orders = [];
  const bell = (c, sd, n) => { for (let i = 0; i < n; i++) { let u = 0; for (let k = 0; k < 6; k++) u += rnd(); orders.push(Math.round(c + ((u - 3) / Math.sqrt(0.5)) * sd)); } };
  bell(21 * 60, 70, 120); bell(13 * 60, 50, 50); bell(18.5 * 60, 55, 30); bell(23.3 * 60, 35, 14);
  const mins = orders.filter((m) => m >= 1 && m <= 1439).sort((a, b) => a - b);
  return mins.map((m, i) => ({ m, ring: RINGS[Math.floor(rnd() * RINGS.length)], mesa: 1 + ((i * 7) % 12), n: 1 + Math.floor(rnd() * 3), dish: DISHES[i % DISHES.length] }));
}

const fmt = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const polar = (r, m) => { const a = (m / 1440) * 2 * Math.PI - Math.PI / 2; return [300 + r * Math.cos(a), 300 + r * Math.sin(a)]; };

export default function mount(root) {
  const orders = makeNight();
  root.innerHTML = `
  <div class="noche__dial"><svg viewBox="0 0 600 600" role="img" aria-label="Reloj de 24 horas con un punto por pedido de una noche de ejemplo" id="nDial"></svg>
    <div class="noche__time" aria-hidden="true"><b id="nTime">19:00</b><span id="nCount"></span></div></div>
  <div class="noche__panel">
    <label class="noche__lab" for="nRange">Hora de la noche</label>
    <input class="noche__range" id="nRange" type="range" min="0" max="1439" step="5" value="1140" aria-valuetext="19:00">
    <div class="noche__chips" role="group" aria-label="Saltar a una hora">
      <button type="button" class="chip" data-t="1140" aria-pressed="false">19:00</button><button type="button" class="chip" data-t="1260" aria-pressed="false">21:00</button><button type="button" class="chip" data-t="1380" aria-pressed="false">23:00</button>
      <button type="button" class="chip" data-d="-60">−1 h</button><button type="button" class="chip" data-d="60">+1 h</button>
    </div>
    <div class="noche__order" aria-labelledby="nOrdT">
      <p class="kicker" id="nOrdT">Último pedido</p>
      <p class="noche__ord" id="nOrd"></p>
      <ol class="noche__stages" id="nStages"></ol>
      <button type="button" class="btn btn--secondary btn--sm" id="nNext">Avanzar el pedido</button>
    </div>
    <p class="noche__say" id="nSay" aria-live="polite"></p>
    <div class="noche__mode"><button type="button" class="btn btn--secondary btn--sm" id="nTake">Manejar el reloj yo</button><button type="button" class="btn btn--secondary btn--sm" id="nStory" hidden>Seguir el relato</button></div>
    <p class="fine">Noche de ejemplo con pedidos inventados. Tocá lo que quieras: no se guarda nada.</p>
  </div>`;
  const svg = root.querySelector("#nDial");
  const $ = (s) => root.querySelector(s);
  // bezel + ticks (every 15 min, hour ticks longer)
  el("circle", { cx: 300, cy: 300, r: 270, class: "n-ring" }, svg);
  for (const r of [245, 124]) el("circle", { cx: 300, cy: 300, r, class: "n-ring n-ring--soft" }, svg);
  for (let m = 0; m < 1440; m += 15) {
    const h = m % 60 === 0, [x1, y1] = polar(270, m), [x2, y2] = polar(h ? 252 : 262, m);
    el("line", { x1, y1, x2, y2, class: h ? "n-tick n-tick--h" : "n-tick" }, svg);
  }
  for (let h = 0; h < 24; h += 3) { const [x, y] = polar(292, h * 60), t = el("text", { x, y, class: "n-lab", "text-anchor": "middle", "dominant-baseline": "central" }, svg); t.textContent = String(h).padStart(2, "0"); }
  const hand = el("line", { x1: 300, y1: 300, x2: 300, y2: 30, class: "n-hand" }, svg);
  const dots = orders.map((o) => { const [cx, cy] = polar(o.ring, o.m); return el("circle", { cx: cx.toFixed(1), cy: cy.toFixed(1), r: 4.4, class: "n-dot" }, svg); });
  const lead = el("line", { x1: 300, y1: 300, x2: 300, y2: 300, class: "n-lead" }, svg);
  const warm = el("circle", { cx: 300, cy: 300, r: 8, class: "n-warm" }, svg);
  const ring = el("circle", { cx: 300, cy: 300, r: 15, class: "n-warm-ring" }, svg);

  const range = $("#nRange"), timeEl = $("#nTime"), countEl = $("#nCount"), ordEl = $("#nOrd"), sayEl = $("#nSay"), stagesEl = $("#nStages"), next = $("#nNext");
  STAGES.forEach(([s]) => { const li = document.createElement("li"); li.textContent = s; stagesEl.appendChild(li); });
  let t = 1140, stage = 0, lastIdx = -2, touched = false, raf = 0, visible = true, lastTs = 0;

  const idxAt = (m) => { let lo = -1; for (let i = 0; i < orders.length; i++) { if (orders[i].m <= m) lo = i; else break; } return lo; };
  function paint() {
    const i = idxAt(t);
    timeEl.textContent = fmt(t); countEl.textContent = i < 0 ? "Sin pedidos todavía" : `${i + 1} pedidos hasta ahora`;
    range.value = t; range.setAttribute("aria-valuetext", fmt(t));
    const [hx, hy] = polar(270, t); hand.setAttribute("x2", hx.toFixed(1)); hand.setAttribute("y2", hy.toFixed(1));
    dots.forEach((d, k) => d.classList.toggle("is-on", k <= i));
    root.querySelectorAll(".chip[data-t]").forEach((c) => c.setAttribute("aria-pressed", String(+c.dataset.t === t)));
    if (i !== lastIdx) { lastIdx = i; stage = 0; showOrder(i); }
  }
  function showOrder(i) {
    if (i < 0) { ordEl.textContent = "Todavía no entró ningún pedido."; warm.style.opacity = ring.style.opacity = lead.style.opacity = 0; next.disabled = true; stagesMark(-1); sayEl.textContent = "Es antes de la primera comanda. Movés el reloj y empiezan a llegar."; return; }
    const o = orders[i];
    ordEl.textContent = `Mesa ${o.mesa} · ${fmt(o.m)} · ${o.n} × ${o.dish}`;
    const [x, y] = polar(o.ring, o.m), [lx, ly] = polar(124, o.m);
    for (const [e, a] of [[warm, { cx: x, cy: y }], [ring, { cx: x, cy: y }], [lead, { x1: lx, y1: ly, x2: x, y2: y }]]) { for (const k in a) e.setAttribute(k, (+a[k]).toFixed(1)); e.style.opacity = ""; }
    next.disabled = false; stagesMark(0); sayEl.textContent = STAGES[0][1];
  }
  function stagesMark(s) { [...stagesEl.children].forEach((li, k) => { li.className = k < s ? "is-done" : k === s ? "is-now" : ""; li.setAttribute("aria-current", k === s ? "step" : "false"); }); next.textContent = s >= STAGES.length - 1 ? "Volver al inicio del pedido" : "Avanzar el pedido"; }
  next.addEventListener("click", () => { touched = true; stage = (stage + 1) % STAGES.length; stagesMark(stage); sayEl.textContent = STAGES[stage][1]; });

  function setT(m, user) { t = Math.max(0, Math.min(1439, Math.round(m))); if (user) touched = true; paint(); }
  range.addEventListener("input", () => setT(+range.value, true));
  root.addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (!b) return; if (b.dataset.t) setT(+b.dataset.t, true); else setT(t + +b.dataset.d, true); });
  const fromPoint = (e) => { const r = svg.getBoundingClientRect(), a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) + Math.PI / 2; return ((a / (2 * Math.PI)) * 1440 + 1440) % 1440; };
  let drag = false;
  svg.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") { drag = true; svg.setPointerCapture(e.pointerId); } setT(fromPoint(e), true); });
  svg.addEventListener("pointermove", (e) => { if (drag) setT(fromPoint(e), true); });
  svg.addEventListener("pointerup", () => { drag = false; });

  // Scroll mode: the page scroll drives the night (19 → 24 h) through the story beats until the visitor takes the controls.
  const track = root.closest(".noche__track");
  const scrolly = !!track && !reduce;
  const take = $("#nTake"), story = $("#nStory");
  let mode = scrolly ? "story" : "free";
  function setMode(m) {
    mode = m; touched = m === "free";
    root.classList.toggle("is-story", m === "story"); take.hidden = m === "free" || !scrolly; story.hidden = m === "story" || !scrolly;
    if (m === "story") onScroll();
  }
  function beatAt(m) { let b = BEATS[0]; for (const x of BEATS) if (m >= x[0]) b = x; return b; }
  let sraf = 0;
  function onScroll() {
    if (mode !== "story") return;
    sraf = 0;
    const r = track.getBoundingClientRect(), span = Math.max(1, r.height - innerHeight);
    const p = Math.max(0, Math.min(1, -r.top / span));
    setT(1140 + p * (1425 - 1140), false);
    const b = beatAt(t);
    if (b[1] !== null) { stage = b[1]; stagesMark(stage); }
    sayEl.textContent = b[2];
  }
  if (scrolly) {
    track.classList.add("is-scrolly");
    take.addEventListener("click", () => setMode("free"));
    story.addEventListener("click", () => setMode("story"));
    addEventListener("scroll", () => { if (mode === "story" && !sraf) sraf = requestAnimationFrame(onScroll); }, { passive: true });
    setMode("story");
  } else { take.hidden = true; story.hidden = true; }
  // (touching the dial, slider or chips hands control to the visitor)
  const grab = () => { if (scrolly && mode === "story") setMode("free"); };
  root.querySelector(".noche__dial").addEventListener("pointerdown", grab);
  range.addEventListener("input", grab);
  root.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", grab));

  // The clock walks 19 → 24 h on its own until the visitor touches it. Only while visible, never with reduced motion.
  function tick(ts) {
    raf = 0; if (touched || !visible || document.hidden) return;
    if (ts - lastTs > 70) { lastTs = ts; if (t < 1439) setT(t + 4); else { stop(); return; } }
    raf = requestAnimationFrame(tick);
  }
  const start = () => { if (!raf && !reduce && !touched && !scrolly && visible) raf = requestAnimationFrame(tick); };
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; visible ? start() : stop(); }, { threshold: 0.35 });
  io.observe(root);
  paint(); start();
  return { destroy() { stop(); io.disconnect(); } };
}
