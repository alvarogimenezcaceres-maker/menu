// Calculator of the commission paid to delivery apps vs. orders that arrive through the venue's own link or QR.
// Everything runs in the browser: nothing is sent or stored. Example numbers only, not any company's rate.
const Gs = (n) => "₲ " + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const num = (v) => Number(String(v).replace(/[^\d]/g, "")) || 0;

const form = document.getElementById("calcForm");
if (form) {
  const out = document.getElementById("calcOut");
  const plan = Number(form.dataset.plan) || 0;
  const el = (id) => document.getElementById(id);
  const fmtInput = (i) => { const n = num(i.value); i.value = n ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".") : ""; };
  const row = (label, value, strong) => { const d = document.createElement("div"); d.className = "calc__row" + (strong ? " is-strong" : ""); const a = document.createElement("span"); a.textContent = label; const b = document.createElement("b"); b.textContent = value; d.append(a, b); return d; };

  const paint = () => {
    const sales = num(el("cSales").value);
    const pct = Math.min(100, Math.max(0, Number(String(el("cPct").value).replace(",", ".")) || 0));
    const own = Math.min(100, Math.max(0, Number(String(el("cOwn").value).replace(",", ".")) || 0));
    const commMonth = sales * pct / 100;
    const moved = commMonth * own / 100;
    const net = moved - plan;
    const rows = [
      row("Comisión estimada por mes, con ese porcentaje de ejemplo", Gs(commMonth)),
      row("Comisión estimada por año", Gs(commMonth * 12)),
      row(`Si el ${own} % de esos pedidos llegara por tu link o QR (0 % de comisión)`, Gs(moved) + " por mes"),
      row(`Menos el plan mensual de Mesaverso (${Gs(plan)})`, Gs(plan)),
      row(net >= 0 ? "Diferencia estimada por mes" : "Diferencia estimada por mes (con estos números el plan costaría más que lo que se mueve)", Gs(Math.abs(net)), true),
    ];
    out.replaceChildren(...rows);
  };

  ["cSales"].forEach((id) => el(id).addEventListener("input", () => { fmtInput(el(id)); paint(); }));
  ["cPct", "cOwn"].forEach((id) => el(id).addEventListener("input", paint));
  form.addEventListener("submit", (e) => e.preventDefault());
  fmtInput(el("cSales")); paint();
}
