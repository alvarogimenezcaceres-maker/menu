// Per-page SEO metadata and FAQ content (single source of truth). build.mjs renders the visible
// FAQ accordion AND the FAQPage JSON-LD from the same entries, so they always match exactly.
// Answers are HTML; the JSON-LD gets the same text with tags stripped.
import { PRICES, formatGs } from "../site.config.mjs";

const gs = (k) => formatGs(PRICES[k]);

// Brand lines (manual 5B + SEO fase 1)
export const BRAND = {
  tagline: "Tus pedidos, directo. Sin comisiones.",
  secondary: "Tu menú. Ahora en otra dimensión.",
  semantic: "Menú digital interactivo para restaurantes y negocios gastronómicos en Paraguay",
};

export const FAQS = {
  qr: [
    ["¿Qué necesito para tener mi menú digital con QR?", `<p>Solo tu carta actual (foto, PDF o lista con precios) y el número de WhatsApp de tu negocio. Mesaverso carga los productos, las categorías y los precios, y te entrega el link y el QR listos para imprimir.</p>`],
    ["¿Mis clientes tienen que descargar una app?", `<p>No. El QR abre tu menú en el navegador del celular. No hay nada que instalar.</p>`],
    ["¿Puedo cambiar precios o productos después?", `<p>Sí. Los cambios se publican en el mismo link, así que el QR impreso sigue sirviendo.</p>`],
    ["¿Cuánto cuesta?", `<p>El plan mensual cuesta ${gs("planMonthly")} por mes (mínimo ${PRICES.minMonths} meses) más ${gs("implementation")} de implementación, en un solo pago. El plan anual cuesta ${gs("planAnnual")} por año, con la implementación incluida. Sin comisión por pedido.</p>`],
    ["¿Sirve en todo Paraguay?", `<p>Sí. El menú funciona con internet en cualquier ciudad. La atención es por WhatsApp.</p>`],
  ],
  caja: [
    ["¿Qué es Mesaverso Caja?", `<p>Es el sistema de caja de Mesaverso para locales con salón: recibe los pedidos del menú y de WhatsApp, los asigna a mesas, manda las comandas a la cocina, divide la cuenta y cierra la caja por turno. Funciona en el navegador de una tablet, celular o computadora.</p>`],
    ["¿Necesito comprar equipos especiales?", `<p>No hace falta un equipo dedicado: funciona en el navegador. Para imprimir comandas se puede usar una impresora térmica de 80 o 58 mm conectada al dispositivo de la cocina.</p>`],
    ["¿Se puede dividir la cuenta?", `<p>Sí. Cada comensal puede pedir desde su celular y la cuenta se puede cobrar total o dividida por persona.</p>`],
    ["¿Cobra comisión por venta?", `<p>No. Mesaverso no cobra comisión por pedido ni por venta.</p>`],
    ["¿Cuánto cuesta la caja?", `<p>Se arma según tu local (cantidad de mesas, cocina, dispositivos). Pedí una demo y te pasamos la propuesta. El menú digital parte de ${gs("planMonthly")} por mes.</p>`],
  ],
  delivery: [
    ["¿Mesaverso reemplaza a las apps de delivery?", `<p>No necesariamente. Muchos negocios siguen en las apps para llegar a clientes nuevos y usan Mesaverso para los clientes que ya los conocen y les piden directo, por WhatsApp, sin comisión por pedido.</p>`],
    ["¿Cuánto me ahorro?", `<p>Depende de la comisión de tu contrato con cada app y de cuántos pedidos pasen al canal directo. En la <a href="/#calculadora">calculadora de la página principal</a> podés poner tus números y comparar con el plan fijo de Mesaverso.</p>`],
    ["¿Quién hace la entrega?", `<p>Vos, con tu delivery propio o el servicio que ya uses. Mesaverso se encarga del menú y de que el pedido te llegue armado por WhatsApp.</p>`],
    ["¿Cómo cobro?", `<p>Como ya lo hacés: efectivo, transferencia o el medio que acuerdes con tu cliente al responder el mensaje.</p>`],
    ["¿Cuánto cuesta?", `<p>Un plan fijo desde ${gs("planMonthly")} por mes, sin comisión por pedido. El plan anual cuesta ${gs("planAnnual")} con la implementación incluida.</p>`],
  ],
  cafe: [
    ["¿Sirve para una cafetería o heladería chica?", `<p>Sí. Mesaverso funciona con un QR en el mostrador o en las mesas y con un link para Instagram y WhatsApp, aunque tengas pocos productos.</p>`],
    ["¿Puedo mostrar sabores, tamaños y extras?", `<p>Sí. Los productos pueden tener opciones con precio (por ejemplo tamaño, sabores o adicionales), y el pedido llega con lo que eligió el cliente.</p>`],
    ["¿Puedo marcar un producto como agotado?", `<p>Sí, se puede marcar como agotado para que el cliente no lo pida.</p>`],
    ["¿Cuánto cuesta?", `<p>Desde ${gs("planMonthly")} por mes, sin comisión por pedido. Con el plan anual (${gs("planAnnual")}) la implementación está incluida.</p>`],
  ],
  home: [
    ["¿Qué es un menú digital?", `<p>Es la carta de tu negocio en una página que tus clientes abren desde el celular, con un link o escaneando un QR. Con Mesaverso, además, pueden buscar productos, recorrer las categorías, armar su pedido y enviártelo por WhatsApp.</p>`],
    ["¿Cómo funciona el menú QR?", `<p>Ponés el QR en la mesa, en el mostrador o en tu material impreso. El cliente lo escanea con la cámara del celular y se abre tu menú, sin instalar ninguna aplicación. Ahí elige los productos, arma su pedido y se lo muestra al mozo o te lo envía por WhatsApp.</p>`],
    ["¿Necesito tener un local físico?", `<p>No. Mesaverso también funciona con un link para negocios que venden por redes sociales, WhatsApp o delivery. Tu cliente puede ver tu menú y pedirte desde su casa.</p>`],
    ["¿Puedo compartir mi menú por WhatsApp e Instagram?", `<p>Sí. Tu menú tiene un link directo que podés poner en tu perfil de Instagram y compartir en tus estados y chats de WhatsApp, en Facebook o en cualquier otro canal. Los negocios sin local también reciben un QR descargable en PDF.</p>`],
    ["¿Cómo recibo los pedidos?", `<p>Por WhatsApp. El cliente arma su pedido en el menú y Mesaverso prepara el mensaje con los productos, las cantidades y el total. El cliente lo revisa y te lo envía desde su WhatsApp; vos respondés y coordinás el pago y la entrega como siempre.</p>`],
    ["¿Puedo mostrar el pedido al mozo?", `<p>Sí. El cliente puede mostrar desde su propio teléfono la lista del pedido para que el mozo lo tome de forma tradicional.</p>`],
    ["¿Mesaverso cobra comisión por cada pedido?", `<p>No. Pagás un plan mensual fijo y Mesaverso no cobra comisión por pedido.</p>`],
    ["¿Cuánto cuesta el menú?", `<p>El plan mensual cuesta ${gs("planMonthly")} por mes, con un mínimo de ${PRICES.minMonths} meses. El plan anual cuesta ${gs("planAnnual")} por año, pagado por adelantado: son 12 meses al precio de ${PRICES.annualMonthsCharged}.</p>`],
    ["¿Cuánto cuesta la implementación?", `<p>${gs("implementation")}, en un solo pago, con el plan mensual. Con el plan anual está incluida. Los QR impresos se cotizan aparte.</p>`],
    ["¿Y si en el primer mes veo que no me sirve?", `<p>Tenés una garantía de ${PRICES.guaranteeDays} días corridos desde el día en que te mandamos el link de tu menú publicado. Si en ese plazo nos avisás por WhatsApp o correo que querés darte de baja, no hace falta que expliques por qué. Con el plan mensual te devolvemos los ${gs("implementation")} de la implementación; el primer mes (${gs("planMonthly")}) se paga porque ya usaste el servicio. Con el plan anual te devolvemos lo pagado menos ese primer mes: ${gs("annualRefund")}. Te lo transferimos dentro de los 10 días hábiles. No se devuelven los QR impresos ni el Pack 3D que ya te entregamos. La garantía vale para la primera vez que contratás. Si seguís con el plan mensual, el mínimo de ${PRICES.minMonths} meses empieza a contar desde el segundo mes.</p>`],
    ["¿Cómo sumo platos en 3D?", `<p>Con el Pack 3D: ${gs("pack3dDish")} por plato, en un solo pago, con cualquiera de los dos planes. Pagás solo los platos que quieras mostrar en 3D. La sesión de fotos 3D presencial se cotiza aparte.</p>`],
  ],
  whatsapp: [
    ["¿Mi cliente tiene que instalar una aplicación?", `<p>No. Tu menú se abre en el navegador del celular, desde el link o escaneando el QR. Cuando envía el pedido, se abre su WhatsApp con el mensaje ya preparado.</p>`],
    ["¿El pedido llega a mi número de siempre?", `<p>Sí. Llega al número de WhatsApp de tu negocio, tanto si usás WhatsApp como WhatsApp Business.</p>`],
    ["¿Sirve si vendo solo por Instagram?", `<p>Sí. Ponés el link del menú en tu perfil y en tus historias o estados: tus clientes ven los productos y los precios, arman el pedido y te lo mandan por WhatsApp. No necesitás local.</p>`],
    ["¿Cómo cobro y coordino la entrega?", `<p>Como ya lo hacés: respondés el mensaje y acordás con tu cliente el pago y la entrega. Mesaverso se encarga de que vea tu menú y de que el pedido te llegue claro y completo.</p>`],
    ["¿Mesaverso cobra comisión por pedido?", `<p>No. Pagás un plan mensual fijo, desde ${gs("planMonthly")} por mes, sin comisión por pedido.</p>`],
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
  {
    path: "/menu-digital-qr-paraguay/", file: "pages/menu-digital-qr-paraguay.html", crumb: "Menú digital QR",
    title: "Menú QR para tu restaurante en Paraguay: cómo funciona | Mesaverso",
    description: "Tu carta en un QR y un link: tus clientes la abren desde el celular sin instalar nada, arman el pedido y te lo mandan por WhatsApp. Hecho en Paraguay.",
    faq: "qr",
  },
  {
    path: "/sistema-de-caja-para-restaurantes/", file: "pages/sistema-de-caja-para-restaurantes.html", crumb: "Sistema de caja",
    title: "Sistema de caja para restaurantes en Paraguay | Mesaverso Caja",
    description: "Mesas, comandas a cocina, cuenta dividida y cierre de caja por turno, en el navegador. Conectado a tu menú QR y a tus pedidos por WhatsApp, sin comisión.",
    faq: "caja",
  },
  {
    path: "/alternativa-a-apps-de-delivery/", file: "pages/alternativa-a-apps-de-delivery.html", crumb: "Alternativa a apps de delivery",
    title: "Alternativa a las apps de delivery para tu restaurante | Mesaverso",
    description: "Recibí pedidos directos por WhatsApp desde tu propio menú digital, con un plan fijo y sin comisión por pedido. Para restaurantes de Paraguay.",
    faq: "delivery",
  },
  {
    path: "/carta-digital-para-cafeterias-y-heladerias/", file: "pages/carta-digital-para-cafeterias-y-heladerias.html", crumb: "Cafeterías y heladerías",
    title: "Carta digital para cafeterías y heladerías | Mesaverso",
    description: "Carta digital con QR para cafeterías, heladerías y confiterías de Paraguay: sabores, tamaños y extras, pedidos por WhatsApp y sin comisión.",
    faq: "cafe",
  },
];
