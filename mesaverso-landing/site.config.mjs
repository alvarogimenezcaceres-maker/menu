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
  planDigital: "Hola, estoy interesado en el Plan Menú Digital de Mesaverso.",
  plan3d: "Hola, estoy interesado en el Plan Menú 3D de Mesaverso.",
  extra3d: "Hola, quiero consultar sobre platos 3D adicionales para Mesaverso.",
  implementation: "Hola, quiero consultar por la implementación de Mesaverso con la promoción de lanzamiento.",
};

// Prices in guaraníes. Shown as "Gs. 150.000". Change here, never in the HTML.
export const PRICES = {
  planDigital: 150000,
  plan3d: 270000,
  extra3dDish: 90000,
  implementationOriginal: 600000,
  implementationPromo: 300000,
  plan3dDishes: 6,
};

export const waUrl = (key) => {
  const text = WHATSAPP_MESSAGES[key];
  if (!text) throw new Error(`Unknown WhatsApp message key: ${key}`);
  return `https://wa.me/${MESAVERSO_WHATSAPP}?text=${encodeURIComponent(text)}`;
};

export const formatGs = (n) => `Gs. ${n.toLocaleString("de-DE")}`;
