// Anonymous counters (see /privacidad/): which button was pressed and where. No cookies, no IP, nothing stored in the browser.
(() => {
  const ref = (() => { try { const h = new URL(document.referrer).host; return h && h !== location.host ? h : ""; } catch { return ""; } })();
  const send = (e, s) => {
    try { navigator.sendBeacon("/api/e", new Blob([JSON.stringify({ e, p: location.pathname, s: s || "", r: e === "view" ? ref : "" })], { type: "application/json" })); } catch {}
  };
  const where = (el) => (el.closest("section[id]") || {}).id || (el.closest("nav") ? "nav" : el.closest("footer") ? "pie" : el.closest("main") ? "pagina" : "");
  if (document.visibilityState !== "prerender") send("view");
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest && ev.target.closest("a[href]");
    if (!a) return;
    const h = a.getAttribute("href") || "";
    if (h.startsWith("https://wa.me/")) send("wa_click", where(a));
    else if (h === "#cierre" || h === "/#cierre") send("cta_click", where(a));
  }, { passive: true });
  document.addEventListener("mv-lead-sent", () => send("lead_sent", "cierre"));
  let calc = false;
  document.addEventListener("input", (ev) => { if (!calc && ev.target.closest && ev.target.closest("#calcForm")) { calc = true; send("calc_used", "calculadora"); } });
})();
