// Per-page SEO metadata and FAQ content (single source of truth). build.mjs renders the visible
// FAQ accordion AND the FAQPage JSON-LD from the same entries, so they always match exactly.
// Answers are HTML; the JSON-LD gets the same text with tags stripped.
import { PRICES, PROMO_TERMS, formatGs } from "../site.config.mjs";

const gs = (k) => formatGs(PRICES[k]);

// Brand lines (manual 5B + SEO fase 1)
export const BRAND = {
  tagline: "Tus pedidos, directo. Sin comisiones.",
  secondary: "Tu menú. Ahora en otra dimensión.",
  semantic: "Menú digital interactivo para restaurantes y negocios gastronómicos en Paraguay",
};

export const FAQS = {
  home: [
    ["¿Qué es un menú digital?", `<p>Es la carta de tu negocio en una página que tus clientes abren desde el celular, con un link o escaneando un QR. Con Mesaverso, además, pueden buscar productos, recorrer las categorías, armar su pedido y enviártelo por WhatsApp.</p>`],
    ["¿Cómo funciona el menú QR?", `<p>Ponés el QR en la mesa, en el mostrador o en tu material impreso. El cliente lo escanea con la cámara del celular y se abre tu menú, sin instalar ninguna aplicación. Ahí elige los productos, arma su pedido y se lo muestra al mozo o te lo envía por WhatsApp.</p>`],
    ["¿Necesito tener un local físico?", `<p>No. Mesaverso también funciona con un link para negocios que venden por redes sociales, WhatsApp o delivery. Tu cliente puede ver tu menú y pedirte desde su casa.</p>`],
    ["¿Puedo compartir mi menú por WhatsApp e Instagram?", `<p>Sí. Tu menú tiene un link directo que podés poner en tu perfil de Instagram y compartir en tus estados y chats de WhatsApp, en Facebook o en cualquier otro canal. Los negocios sin local también reciben un QR descargable en PDF.</p>`],
    ["¿Cómo recibo los pedidos?", `<p>Por WhatsApp. El cliente arma su pedido en el menú y Mesaverso prepara el mensaje con los productos, las cantidades y el total. El cliente lo revisa y te lo envía desde su WhatsApp; vos respondés y coordinás el pago y la entrega como siempre.</p>`],
    ["¿Puedo mostrar el pedido al mozo?", `<p>Sí. El cliente puede mostrar desde su propio teléfono la lista del pedido para que el mozo lo tome de forma tradicional.</p>`],
    ["¿Mesaverso cobra comisión por cada pedido?", `<p>No. Pagás un plan mensual fijo y Mesaverso no cobra comisión por pedido.</p>`],
    ["¿Qué incluye el plan 3D?", `<p>Todo lo del Plan Menú Digital, más ${PRICES.plan3dDishes} platos en 3D y una actualización de un plato 3D por mes sin costo adicional.</p>`],
    ["¿Cuánto cuesta un plato 3D adicional?", `<p>${gs("extra3dDish")} por plato, cada vez que necesites sumar uno nuevo.</p>`],
    ["¿Cuánto cuesta la implementación?", `<p><s>${gs("implementationOriginal")}</s>. Durante la promoción de lanzamiento: <strong>${gs("implementationPromo")}</strong>. Es un pago único. ${PROMO_TERMS} Los QR impresos y la sesión de fotos 3D presencial se cotizan aparte.</p>`],
    ["¿Cuánto cuesta el menú?", `<p>El Plan Menú Digital cuesta ${gs("planDigital")} por mes y el Plan Menú 3D, ${gs("plan3d")} por mes.</p>`],
  ],
  whatsapp: [
    ["¿Mi cliente tiene que instalar una aplicación?", `<p>No. Tu menú se abre en el navegador del celular, desde el link o escaneando el QR. Cuando envía el pedido, se abre su WhatsApp con el mensaje ya preparado.</p>`],
    ["¿El pedido llega a mi número de siempre?", `<p>Sí. Llega al número de WhatsApp de tu negocio, tanto si usás WhatsApp como WhatsApp Business.</p>`],
    ["¿Sirve si vendo solo por Instagram?", `<p>Sí. Ponés el link del menú en tu perfil y en tus historias o estados: tus clientes ven los productos y los precios, arman el pedido y te lo mandan por WhatsApp. No necesitás local.</p>`],
    ["¿Cómo cobro y coordino la entrega?", `<p>Como ya lo hacés: respondés el mensaje y acordás con tu cliente el pago y la entrega. Mesaverso se encarga de que vea tu menú y de que el pedido te llegue claro y completo.</p>`],
    ["¿Mesaverso cobra comisión por pedido?", `<p>No. Pagás un plan mensual fijo, desde ${gs("planDigital")} por mes, sin comisión por pedido.</p>`],
  ],
};

// Indexable pages. `path` is the canonical path (trailing slash for folders).
export const PAGES = [
  {
    path: "/",
    file: "index.html",
    title: "Menú digital QR para restaurantes en Paraguay | Mesaverso",
    description: "Menú digital con QR o link para restaurantes y negocios gastronómicos de Paraguay. Tus clientes te piden por WhatsApp, sin comisión por pedido.",
    ogTitle: "Mesaverso: menú digital para restaurantes en Paraguay",
    ogDescription: `${BRAND.secondary} QR o link, pedidos directo a tu WhatsApp y platos en 3D, sin comisión por pedido.`,
    faq: "home",
  },
  {
    path: "/pedidos-por-whatsapp/",
    file: "pages/pedidos-por-whatsapp.html",
    crumb: "Pedidos por WhatsApp",
    title: "Pedidos por WhatsApp para restaurantes | Mesaverso",
    description: "Tu cliente arma el pedido en tu menú digital y te llega listo a tu WhatsApp, con productos y total. Sin comisión por pedido, con o sin local.",
    ogTitle: "Pedidos por WhatsApp para restaurantes, sin comisión | Mesaverso",
    ogDescription: `${BRAND.secondary} Tu cliente arma el pedido en tu menú y te llega listo a tu WhatsApp, sin comisión por pedido.`,
    faq: "whatsapp",
  },
];
