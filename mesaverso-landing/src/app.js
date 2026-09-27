// Mesaverso landing: progressive enhancement only. Every CTA is a real link in the HTML;
// this adds the interactive menu demo, mobile nav, lazy 3D, the lead form and analytics hooks.
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.classList.add("js");

  /* ---------- analytics hooks ----------
     No provider is configured. Events go to window.dataLayer (if a tag manager is added later)
     and as a DOM event, so a provider can subscribe with:
     window.addEventListener("mesaverso:track", (e) => provider.send(e.detail.event, e.detail)) */
  const track = (event, props = {}) => {
    const detail = { event, ...props };
    if (Array.isArray(window.dataLayer)) window.dataLayer.push(detail);
    window.dispatchEvent(new CustomEvent("mesaverso:track", { detail }));
  };
  window.mesaversoTrack = track;
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-track]");
    if (!el) return;
    track(el.dataset.track, el.dataset.trackWhere ? { where: el.dataset.trackWhere } : {});
    if (el.dataset.track !== "whatsapp_click" && el.href && el.href.includes("wa.me/")) track("whatsapp_click", { where: el.dataset.track });
  });

  /* ---------- nav ---------- */
  const nav = $(".nav");
  const toggle = $(".nav__toggle");
  const sheet = $("#menu-movil");
  const onScroll = () => nav.classList.toggle("is-scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  const setMenu = (open, { focus = true } = {}) => {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    sheet.hidden = !open;
    document.body.style.overflow = open ? "hidden" : "";
    if (open && focus) $("a", sheet).focus();
    else if (!open && focus) toggle.focus();
  };
  toggle.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"));
  sheet.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false, { focus: false }); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sheet.hidden) setMenu(false);
  });
  matchMedia("(min-width: 900px)").addEventListener("change", (m) => { if (m.matches && !sheet.hidden) setMenu(false, { focus: false }); });
  // One primary per view: the header CTA is secondary while the hero (with its primary) is visible.
  const hero = $(".hero");
  if (hero && "IntersectionObserver" in window) {
    new IntersectionObserver(([en]) => nav.classList.toggle("is-past-hero", !en.isIntersecting), { rootMargin: "-68px 0px 0px 0px" }).observe(hero);
  }

  /* ---------- logo: every 8 s the warm dot travels the M (brand manual 5B §5) ----------
     The SMIL animation is in the markup with begin="indefinite"; start it only when motion is OK. */
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const animateLogos = () => $$(".mv-wordmark[data-animated]").forEach((logo) => {
    const dot = $(".mv-dot", logo);
    const anims = [...dot.children];
    if (motion.matches) { anims.forEach((a) => a.endElement && a.endElement()); dot.setAttribute("cx", 84); dot.setAttribute("cy", 82); return; }
    dot.setAttribute("cx", 0); dot.setAttribute("cy", 0); // animateMotion places it on the line
    anims.forEach((a) => a.beginElement && a.beginElement());
  });
  animateLogos();
  motion.addEventListener("change", animateLogos);

  /* ---------- money ---------- */
  const gs = (n) => "Gs. " + n.toLocaleString("de-DE");

  /* ---------- interactive menu demo (hero phone) ---------- */
  const demo = $("[data-demo]");
  const items = $$(".item", demo);
  const byId = Object.fromEntries(items.map((li) => [li.dataset.id, { name: li.dataset.name, price: +li.dataset.price, el: li }]));
  const order = { pizza: 1, cerveza: 2 }; // same example as the WhatsApp section
  const PLUS = '<svg aria-hidden="true"><use href="#i-plus"/></svg>';
  const MINUS = '<svg aria-hidden="true"><use href="#i-minus"/></svg>';
  const lines = () => Object.entries(order).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n, ...byId[id] }));
  const total = () => lines().reduce((s, l) => s + l.price * l.n, 0);

  const renderQty = (id) => {
    const { el, name } = byId[id];
    const n = order[id] || 0;
    const box = $("[data-qty]", el);
    box.innerHTML = n
      ? `<button type="button" data-dec="${id}" aria-label="Quitar 1 de ${name}">${MINUS}</button><output aria-live="polite" aria-label="Cantidad de ${name}">${n}</output><button type="button" class="add" data-inc="${id}" aria-label="Sumar 1 más de ${name}">${PLUS}</button>`
      : `<button type="button" class="add" data-inc="${id}" aria-label="Agregar ${name} al pedido">${PLUS}</button>`;
  };
  const bar = $("[data-demo-open]", demo);
  const renderBar = () => {
    const count = lines().reduce((s, l) => s + l.n, 0);
    $("[data-demo-count]", demo).textContent = count;
    $("[data-demo-total]", demo).textContent = gs(total());
    bar.toggleAttribute("data-empty", count === 0);
    bar.setAttribute("aria-label", `Ver pedido: ${count} productos, ${gs(total())}`);
    // The floating chip next to the phone mirrors the order: Mesaverso → order → WhatsApp.
    waChipCount.textContent = count ? `${count} producto${count === 1 ? "" : "s"}` : "Armá tu pedido";
  };
  const waChip = $("[data-demo-wa-chip]");
  const waChipCount = $("[data-demo-wa-chip-count]");
  const bump = (id) => {
    const li = byId[id].el;
    li.classList.add("just-added");
    clearTimeout(li._t); li._t = setTimeout(() => li.classList.remove("just-added"), 700);
    waChip.classList.add("is-ping");
    clearTimeout(waChip._t); waChip._t = setTimeout(() => waChip.classList.remove("is-ping"), 900);
  };
  Object.keys(byId).forEach(renderQty);
  renderBar();

  demo.addEventListener("click", (e) => {
    const inc = e.target.closest("[data-inc]");
    const dec = e.target.closest("[data-dec]");
    if (!inc && !dec) return;
    const id = (inc || dec).dataset.inc || (inc || dec).dataset.dec;
    order[id] = Math.max(0, (order[id] || 0) + (inc ? 1 : -1));
    renderQty(id);
    renderBar();
    if (inc) bump(id);
    // Keep keyboard focus on the same control after re-render.
    const again = $(`[data-${inc ? "inc" : "dec"}="${id}"]`, byId[id].el) || $(`[data-inc="${id}"]`, byId[id].el);
    if (again && document.activeElement === document.body) again.focus();
    if (!demo.dataset.touched) { demo.dataset.touched = "1"; track("demo_menu_interact"); }
  });

  // categories + search
  let cat = "todo";
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const search = $("[data-demo-search]", demo);
  const filter = () => {
    const q = norm(search.value.trim());
    let shown = 0;
    items.forEach((li) => {
      const ok = (cat === "todo" || li.dataset.cat === cat) && (!q || norm(li.textContent).includes(q));
      li.hidden = !ok;
      if (ok) shown++;
    });
    $("[data-demo-empty]", demo).hidden = shown > 0;
  };
  $$(".app-cats [data-cat]", demo).forEach((b) => b.addEventListener("click", () => {
    cat = b.dataset.cat;
    $$(".app-cats [data-cat]", demo).forEach((x) => { x.classList.toggle("is-on", x === b); x.setAttribute("aria-pressed", String(x === b)); });
    filter();
  }));
  search.addEventListener("input", filter);

  // order sheet
  const sheetEl = $("[data-demo-sheet]", demo);
  const waiterEl = $("[data-demo-waiter-view]", demo);
  const openSheet = () => {
    $("[data-demo-sheet-list]", demo).innerHTML = lines().map((l) => `<li><span>${l.n} × ${l.name}</span><b>${gs(l.price * l.n)}</b></li>`).join("");
    $("[data-demo-sheet-total]", demo).textContent = gs(total());
    sheetEl.hidden = false;
    $("[data-demo-close]", demo).focus();
  };
  const closeSheet = () => { sheetEl.hidden = true; bar.focus(); };
  bar.addEventListener("click", openSheet);
  $("[data-demo-close]", demo).addEventListener("click", closeSheet);
  demo.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!waiterEl.hidden) { waiterEl.hidden = true; bar.focus(); }
    else if (!sheetEl.hidden) closeSheet();
  });
  $("[data-demo-waiter]", demo).addEventListener("click", () => {
    $("[data-demo-waiter-list]", demo).innerHTML = lines().map((l) => `<li><b>${l.n}</b>${l.name}</li>`).join("");
    $("[data-demo-waiter-total]", demo).textContent = gs(total());
    sheetEl.hidden = true;
    waiterEl.hidden = false;
    $("[data-demo-waiter-close]", demo).focus();
    track("demo_show_waiter");
  });
  $("[data-demo-waiter-close]", demo).addEventListener("click", () => { waiterEl.hidden = true; bar.focus(); });

  // "Enviar por WhatsApp" in the demo: fill the WhatsApp section with this order and go there.
  // (In a real Mesaverso menu this button opens the business's WhatsApp with the message.)
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  $("[data-demo-wa]", demo).addEventListener("click", () => {
    const ls = lines();
    const bubble = $("[data-wa-message]");
    bubble.innerHTML = `<p>¡Hola La Brasa! Quiero hacer este pedido:</p><p>${ls.map((l) => `• ${l.n} × ${esc(l.name)} — ${gs(l.price * l.n)}`).join("<br>")}</p><p><strong>Total: ${gs(total())}</strong></p><p>Nombre: <br>¿Delivery o pick up?: <br>Dirección (si es delivery): </p>`;
    sheetEl.hidden = true;
    track("demo_send_whatsapp");
    const target = $("#whatsapp");
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    bubble.classList.remove("flash"); void bubble.offsetWidth; bubble.classList.add("flash");
    $("#wa-title").setAttribute("tabindex", "-1");
    $("#wa-title").focus({ preventScroll: true });
  });

  /* ---------- 3D: model-viewer only loads when the visitor asks for it ---------- */
  const viewer = $("[data-3d]");
  const loadBtn = $("[data-3d-load]");
  loadBtn.addEventListener("click", () => {
    loadBtn.disabled = true;
    loadBtn.lastChild.textContent = "Cargando 3D…";
    const s = document.createElement("script");
    s.type = "module";
    s.src = "/vendor/model-viewer.min.js";
    s.onerror = () => { loadBtn.disabled = false; loadBtn.lastChild.textContent = "Reintentar 3D"; };
    document.head.append(s);
    const mv = document.createElement("model-viewer");
    Object.entries({
      src: "/assets/torta-3d.glb", alt: "Torta de zanahoria en 3D, modelo interactivo de ejemplo",
      "camera-controls": "", "touch-action": "pan-y", "shadow-intensity": "1", exposure: "1.05",
      "camera-orbit": "30deg 70deg auto", "interaction-prompt": "none",
      ar: "", "ar-modes": "webxr scene-viewer quick-look",
    }).forEach(([k, v]) => mv.setAttribute(k, v));
    if (!reduceMotion) { mv.setAttribute("auto-rotate", ""); mv.setAttribute("auto-rotate-delay", "0"); mv.setAttribute("rotation-per-second", "18deg"); }
    mv.addEventListener("load", () => viewer.classList.add("is-live"), { once: true });
    mv.addEventListener("error", () => { loadBtn.disabled = false; loadBtn.lastChild.textContent = "Reintentar 3D"; mv.remove(); }, { once: true });
    viewer.append(mv);
  });

  /* ---------- reveal on scroll ---------- */
  const reveals = $$(".reveal");
  if (!reduceMotion && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
    }), { rootMargin: "0px 0px -8% 0px", threshold: .08 });
    reveals.forEach((el) => io.observe(el));
    const story = $("[data-story]");
    const so = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { story.classList.add("is-in"); so.disconnect(); } }), { threshold: .15 });
    so.observe(story);
  } else [...reveals, $("[data-story]")].forEach((el) => el.classList.add("is-in"));

  // Floating WhatsApp button hides where it would cover the form or duplicate the final CTAs.
  const fab = $(".wa-fab");
  if ("IntersectionObserver" in window) {
    const covered = new Set();
    const fo = new IntersectionObserver((es) => {
      es.forEach((en) => (en.isIntersecting ? covered.add(en.target) : covered.delete(en.target)));
      fab.classList.toggle("is-hidden", covered.size > 0);
    });
    [$("#demo"), $(".final"), $(".hero")].forEach((el) => el && fo.observe(el));
  }

  /* ---------- lead form ---------- */
  const form = $("[data-lead-form]");
  const status = $("[data-form-status]");
  const summary = $("[data-form-summary]");
  const submit = $("[data-form-submit]");
  const label = $("[data-form-label]");
  $("[data-form-t]").value = String(Date.now());
  let started = false;
  form.addEventListener("focusin", () => { if (!started) { started = true; track("demo_form_start"); } });

  const rules = {
    name: (v) => (v.length < 2 ? "Escribí tu nombre." : v.length > 80 ? "El nombre es demasiado largo." : ""),
    business: (v) => (v.length < 2 ? "Escribí el nombre de tu negocio." : v.length > 100 ? "El nombre del negocio es demasiado largo." : ""),
    phone: (v) => { const d = v.replace(/\D/g, ""); return !v ? "Escribí tu número de WhatsApp." : !/^[+\d\s().-]+$/.test(v) || d.length < 6 || d.length > 15 ? "Revisá el número: solo números, por ejemplo 0981 123 456." : ""; },
    type: (v) => (!v ? "Elegí el tipo de negocio." : ""),
    message: (v) => (v.length > 1000 ? "El mensaje puede tener hasta 1000 caracteres." : ""),
  };
  const setErr = (name, msg) => {
    const input = form.elements[name];
    const p = $(`[data-err-for="${name}"]`, form);
    if (p) p.textContent = msg;
    if (msg) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
  };
  const check = (name) => { const msg = rules[name](form.elements[name].value.trim()); setErr(name, msg); return msg; };
  Object.keys(rules).forEach((name) => {
    const el = form.elements[name];
    el.addEventListener("blur", () => { if (el.value.trim() || el.hasAttribute("aria-invalid")) check(name); });
    el.addEventListener("input", () => { if (el.hasAttribute("aria-invalid")) check(name); });
  });
  const setStatus = (kind, html) => { status.className = "form__status" + (kind ? ` is-${kind}` : ""); status.innerHTML = html; };
  const waDemo = $('a[data-track-where="form_alt"]').href;

  let sending = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;
    setStatus("", "");
    const errors = Object.keys(rules).map((n) => [n, check(n)]).filter(([, m]) => m);
    if (errors.length) {
      summary.innerHTML = `<strong>Revisá estos datos:</strong><ul>${errors.map(([n, m]) => `<li><a href="#${form.elements[n].id}">${m}</a></li>`).join("")}</ul>`;
      summary.hidden = false;
      summary.focus();
      return;
    }
    summary.hidden = true;
    sending = true;
    form.classList.add("is-sending");
    submit.setAttribute("aria-disabled", "true");
    label.textContent = "Enviando…";
    const data = Object.fromEntries(new FormData(form));
    try {
      const res = await fetch(form.action, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(data) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        if (body.fields) Object.entries(body.fields).forEach(([n, m]) => setErr(n, m));
        throw new Error(body.error || "No pudimos enviar tu solicitud.");
      }
      track("demo_form_submit", { type: data.type });
      form.reset();
      $("[data-form-t]").value = String(Date.now());
      setStatus("ok", `<strong>¡Listo, ${esc(data.name.split(" ")[0])}! Recibimos tu solicitud.</strong><span>Te vamos a escribir por WhatsApp para coordinar la demo.</span>`);
    } catch (err) {
      setStatus("err", `<strong>${esc(err.message)}</strong><span>Probá de nuevo en un momento o escribinos directamente:</span><a class="btn btn--secondary" href="${waDemo}" target="_blank" rel="noopener" data-track="whatsapp_click" data-track-where="form_error"><svg aria-hidden="true"><use href="#i-wa"/></svg>Escribinos por WhatsApp</a>`);
    } finally {
      sending = false;
      form.classList.remove("is-sending");
      submit.removeAttribute("aria-disabled");
      label.textContent = "Enviar solicitud";
      status.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
    }
  });
})();
