
/* Reservas por WhatsApp: no hay agenda ni servidor; el mensaje sale armado por WhatsApp y el local confirma */
(() => {
  const dlg = $("#reserveDlg"), btn = $("#reserveBtn"), form = $("#reserveForm");
  if (!dlg || !btn || !form || !WHATSAPP) return;
  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const close = () => { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); };
  btn.addEventListener("click", () => {
    const today = new Date(), last = new Date(); last.setDate(last.getDate() + 90);
    $("#rvDate").min = iso(today); $("#rvDate").max = iso(last); $("#rvErr").textContent = "";
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    track("reserve_click");
  });
  $("#rvCancel").addEventListener("click", close);
  dlg.addEventListener("click", e => { if (e.target === dlg) close(); });
  form.addEventListener("submit", e => {
    e.preventDefault();
    const name = $("#rvName").value.trim(), date = $("#rvDate").value, time = $("#rvTime").value, note = $("#rvNote").value.trim();
    const err = msg => { $("#rvErr").textContent = msg; };
    if (name.length < 2) return err("Escribí tu nombre.");
    if (!date) return err("Elegí la fecha.");
    const [y, m, d] = date.split("-").map(Number), when = new Date(y, m - 1, d);
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    if (when < midnight) return err("La fecha ya pasó. Elegí otra.");
    if (!time) return err("Elegí la hora.");
    const day = when.toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" });
    const text = [`Hola, quiero reservar una mesa en ${RESTAURANT}.`, "", `Nombre: ${name}`, `Personas: ${$("#rvPeople").value}`, `Fecha: ${day}`, `Hora: ${time}`, ...(note ? [`Aclaración: ${note}`] : []), "", "¿Me confirman la reserva? Gracias."].join("\n");
    const a = document.createElement("a");
    a.href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`; a.target = "_blank"; a.rel = "noopener";
    document.body.append(a); a.click(); a.remove();
    close();
  });
})();
