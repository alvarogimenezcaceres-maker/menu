// Shared by build.mjs (renders the <select> options) and the Worker (server-side validation).
export const BUSINESS_TYPES = [
  "Restaurante",
  "Comedor o viandas para empresas",
  "Catering y eventos",
  "Pizzería",
  "Hamburguesería",
  "Cafetería",
  "Bar",
  "Sushi",
  "Panadería",
  "Repostería",
  "Heladería",
  "Emprendimiento desde casa",
  "Food truck",
  "Dark kitchen",
  "Delivery",
  "Emprendimiento gastronómico",
  "Otro",
];

export const CITIES = ["Asunción", "Luque", "San Lorenzo", "Lambaré", "Fernando de la Mora", "Capiatá", "Ñemby", "Villa Elisa", "Encarnación", "Ciudad del Este", "Pedro Juan Caballero", "Otra ciudad"];
export const PRODUCT_RANGES = ["Hasta 11", "12 a 30", "31 a 60", "Más de 60", "Todavía no sé"];
export const PLACES = ["Tengo un local abierto", "Vendo solo por delivery o redes", "Estoy por abrir"];
export const INTERESTS = ["Plan Gratis", "Plan mensual", "Plan anual", "Todavía no sé"];
export const HOWS = ["WhatsApp", "Papel y teléfono", "Apps de delivery", "Todavía no tengo local", "Otro"];

// Collapse whitespace, drop control characters. Output is later HTML-escaped where rendered.
export const clean = (v, max) =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, max + 1);

export function validateLead(input) {
  const lead = {
    name: clean(input.name, 80).replace(/\s+/g, " "),
    business: clean(input.business, 100).replace(/\s+/g, " "),
    phone: clean(input.phone, 24),
    type: clean(input.type, 60),
    message: clean(input.message, 1000),
    // optional: they help us prepare the demo; each one must be one of the offered values (or empty)
    email: clean(input.email, 120).toLowerCase(),
    city: clean(input.city, 40),
    place: clean(input.place, 60),
    products: clean(input.products, 30),
    how: clean(input.how, 40),
    interest: clean(input.interest, 30),
    social: clean(input.social, 100),
  };
  const fields = {};
  if (lead.name.length < 2) fields.name = "Escribí tu nombre.";
  else if (lead.name.length > 80) fields.name = "El nombre es demasiado largo.";
  if (lead.business.length < 2) fields.business = "Escribí el nombre de tu negocio.";
  else if (lead.business.length > 100) fields.business = "El nombre del negocio es demasiado largo.";
  const digits = lead.phone.replace(/\D/g, "");
  if (!/^[+\d\s().-]+$/.test(lead.phone) || digits.length < 6 || digits.length > 15)
    fields.phone = "Revisá el número: solo números, por ejemplo 0981 123 456.";
  if (!BUSINESS_TYPES.includes(lead.type)) fields.type = "Elegí el tipo de negocio.";
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email)) fields.email = "Revisá el correo o dejalo vacío.";
  else if (lead.email.length > 120) fields.email = "El correo es demasiado largo.";
  for (const [k, list] of [["city", CITIES], ["place", PLACES], ["products", PRODUCT_RANGES], ["how", HOWS], ["interest", INTERESTS]])
    if (lead[k] && !list.includes(lead[k])) fields[k] = "Elegí una de las opciones.";
  if (lead.social.length > 100) fields.social = "Es demasiado largo.";
  // consent to be contacted: required, and stored with the date and the notice version (no IP, no user agent)
  lead.consent = input.consent === true;
  if (!lead.consent) fields.consent = "Marcá la casilla para que podamos escribirte.";
  if (lead.message.length > 1000) fields.message = "El mensaje puede tener hasta 1000 caracteres.";
  return { lead, fields, ok: Object.keys(fields).length === 0 };
}

// Paraguayan numbers written locally ("0981…") become 595981… so the owner can tap them in WhatsApp.
export const phoneToWa = (phone) => {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "595" + d.slice(1);
  else if (d.length === 9 && d.startsWith("9")) d = "595" + d;
  return d;
};
