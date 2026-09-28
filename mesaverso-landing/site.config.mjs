// Single source of truth for values that change when the custom domain arrives or the
// commercial contact changes. build.mjs injects them into the HTML at build time, so every
// CTA works without JavaScript and nothing is hardcoded across components.
//
// To move to the future domain: set SITE_URL (env var or the default below), rebuild, deploy,
// and add the custom domain in wrangler.jsonc (`routes`). Nothing else changes.

export const SITE_URL = (process.env.SITE_URL || "https://mesaverso-landing.alvarogimenezcaceres.workers.dev").replace(/\/+$/, "");

// Commercial WhatsApp, digits only (country code + number), as wa.me expects.
export const MESAVERSO_WHATSAPP = "595984900323";

// Prefilled message per CTA context. Keys are referenced from the HTML as {{wa:<key>}}.
export const WHATSAPP_MESSAGES = {
  demo: "Hola, quiero solicitar una demo de Mesaverso.",
  general: "Hola, quiero hablar con Mesaverso.",
  planMonthly: "Hola, estoy interesado en el plan mensual de Mesaverso.",
  planAnnual: "Hola, estoy interesado en el plan anual de Mesaverso.",
  pack3d: "Hola, quiero consultar por el Pack 3D de Mesaverso.",
};

// Prices in guaraníes. Shown as "Gs. 150.000". Change here, never in the HTML.
// Offer approved 2026-09-27 ("Pedidos Directo"): monthly with a 6-month minimum plus a one-off
// implementation, or annual paid upfront (12 months for the price of `annualMonthsCharged`)
// with the implementation included. 3D is an optional one-off pack per dish.
export const PRICES = {
  planMonthly: 150000,
  minMonths: 6,
  annualMonthsCharged: 10,
  implementation: 300000,
  pack3dDish: 120000,
};
PRICES.planAnnual = PRICES.planMonthly * PRICES.annualMonthsCharged;
// First year on each plan, for the worked example.
PRICES.firstYearMonthly = PRICES.implementation + PRICES.planMonthly * 12;
PRICES.annualSaving = PRICES.firstYearMonthly - PRICES.planAnnual;

export const waUrl = (key) => {
  const text = WHATSAPP_MESSAGES[key];
  if (!text) throw new Error(`Unknown WhatsApp message key: ${key}`);
  return `https://wa.me/${MESAVERSO_WHATSAPP}?text=${encodeURIComponent(text)}`;
};

export const formatGs = (n) => `Gs. ${n.toLocaleString("de-DE")}`;
