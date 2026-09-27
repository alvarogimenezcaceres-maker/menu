// Mesaverso landing Worker. Static assets are served by Cloudflare directly; only /api/* runs here
// (see run_worker_first in wrangler.jsonc).
//
// POST /api/lead: validates the demo request server-side, stores it in KV (LEADS) and, when
// configured, emails it through Resend. The destination address only exists as a Worker secret
// (LEAD_TO_EMAIL): it is never in the page, the client JS or this public repository.
//
// Secrets / vars (wrangler secret put <NAME>):
//   RESEND_API_KEY   Resend API key (free plan). Without it leads are still saved in KV.
//   LEAD_TO_EMAIL    where leads are sent.
//   LEAD_FROM_EMAIL  optional sender, default "Mesaverso <onboarding@resend.dev>" (Resend's test
//                    sender only delivers to the Resend account's own address; verify a domain later).
import { validateLead, phoneToWa } from "./lead-schema.js";

const MAX_BODY = 8 * 1024;
const MIN_FILL_MS = 2500; // faster than this is a bot
const RATE_LIMIT = 5; // submissions per IP per hour
const LEAD_TTL = 60 * 60 * 24 * 180; // keep leads 180 days

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function sameOrigin(request, url, env) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let host;
  try { host = new URL(origin).host; } catch { return false; }
  if (host === url.host) return true;
  // Extra allowed origins (e.g. the future custom domain during a migration), comma-separated.
  const extra = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return extra.some((o) => { try { return new URL(o).host === host; } catch { return false; } });
}

async function readBody(request) {
  const type = request.headers.get("content-type") || "";
  const text = await request.text();
  if (text.length > MAX_BODY) return { tooBig: true };
  if (type.includes("application/json")) {
    try { return { data: JSON.parse(text), form: false }; } catch { return { data: null }; }
  }
  if (type.includes("application/x-www-form-urlencoded")) return { data: Object.fromEntries(new URLSearchParams(text)), form: true };
  return { data: null };
}

async function sendEmail(env, lead, id) {
  if (!env.RESEND_API_KEY || !env.LEAD_TO_EMAIL) return "not_configured";
  const wa = phoneToWa(lead.phone);
  const rows = [
    ["Nombre", lead.name],
    ["Negocio", lead.business],
    ["WhatsApp", lead.phone],
    ["Tipo de negocio", lead.type],
    ["Mensaje", lead.message || "(sin mensaje)"],
  ];
  const text = `Nueva solicitud de demo de Mesaverso\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nEscribirle: https://wa.me/${wa}\nID: ${id}`;
  const html = `<h2 style="font-family:sans-serif">Nueva solicitud de demo</h2><table style="font-family:sans-serif;font-size:15px;border-collapse:collapse">${rows
    .map(([k, v]) => `<tr><td style="padding:6px 14px 6px 0;color:#666;vertical-align:top">${k}</td><td style="padding:6px 0;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`)
    .join("")}</table><p style="font-family:sans-serif"><a href="https://wa.me/${wa}">Escribirle por WhatsApp</a></p><p style="font-family:sans-serif;color:#999;font-size:12px">ID ${id}</p>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.LEAD_FROM_EMAIL || "Mesaverso <onboarding@resend.dev>",
      to: [env.LEAD_TO_EMAIL],
      subject: `Demo Mesaverso: ${lead.business} (${lead.type})`,
      text,
      html,
    }),
  });
  if (!res.ok) {
    console.error("resend_failed", res.status, (await res.text()).slice(0, 300));
    return "failed";
  }
  return "sent";
}

async function handleLead(request, env, url) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
  if (!sameOrigin(request, url, env)) return json(403, { ok: false, error: "Origen no permitido." });
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY) return json(413, { ok: false, error: "La solicitud es demasiado grande." });

  const { data, form, tooBig } = await readBody(request);
  if (tooBig) return json(413, { ok: false, error: "La solicitud es demasiado grande." });
  if (!data || typeof data !== "object") return json(400, { ok: false, error: "No pudimos leer el formulario." });
  const done = (body) => (form ? Response.redirect(new URL("/gracias.html", url), 303) : json(200, body));

  // Honeypot and fill-time trap: answer like a success so bots learn nothing.
  const t = Number(data.t);
  if (String(data.website || "").trim() || (t && Date.now() - t < MIN_FILL_MS)) return done({ ok: true });

  const { lead, fields, ok } = validateLead(data);
  if (!ok) return json(422, { ok: false, error: "Revisá los datos marcados.", fields });

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (env.LEADS) {
    const rlKey = `rl:${ip}:${Math.floor(Date.now() / 3600000)}`;
    const count = Number(await env.LEADS.get(rlKey)) || 0;
    if (count >= RATE_LIMIT) return json(429, { ok: false, error: "Recibimos varias solicitudes seguidas. Probá más tarde o escribinos por WhatsApp." });
    await env.LEADS.put(rlKey, String(count + 1), { expirationTtl: 3600 });
  }

  const now = new Date();
  const id = `${now.toISOString()}-${crypto.randomUUID().slice(0, 8)}`;
  const record = { ...lead, at: now.toISOString(), country: request.cf?.country || null };

  let stored = false;
  if (env.LEADS) {
    try {
      await env.LEADS.put(`lead:${id}`, JSON.stringify(record), { expirationTtl: LEAD_TTL, metadata: { business: lead.business, type: lead.type } });
      stored = true;
    } catch (e) {
      console.error("kv_put_failed", String(e));
    }
  }
  let email = "failed";
  try { email = await sendEmail(env, lead, id); } catch (e) { console.error("email_error", String(e)); }
  console.log("lead", JSON.stringify({ id, stored, email }));

  if (!stored && email !== "sent") return json(502, { ok: false, error: "No pudimos enviar tu solicitud." });
  return done({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/lead") return handleLead(request, env, url);
    if (url.pathname.startsWith("/api/")) return json(404, { ok: false, error: "No encontrado." });
    return env.ASSETS.fetch(request);
  },
};
