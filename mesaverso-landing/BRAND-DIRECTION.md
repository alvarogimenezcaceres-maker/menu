# MESAVERSO: marca aplicada (manual 5B · Titanio + Luz Cálida)

Este documento resume cómo quedó aplicado el manual 5B en esta landing y qué se decidió además del manual. El manual
completo es el prompt «MESAVERSO 5B». La versión anterior de la marca («Añil y Azafrán») quedó en el commit `bac703c`.

## Idea

Un menú digital que lleva el pedido **directo del cliente al local**, sin intermediarios ni comisiones.

- Tagline principal: **«Tus pedidos, directo. Sin comisiones.»**
- Taglines de apoyo: «Tu local entero, en un solo link.» · «Mirá el plato antes de pedirlo.» · «Del menú a tu WhatsApp. Sin nadie en el medio.»

## Logo

- **Isotipo:** una M trazada con una sola línea. Empieza en el local (punto Titanio) y termina en el cliente (punto Luz Cálida, «el pedido que llega»).
- **Logo principal `[M]ESAVERSO`:** el isotipo reemplaza la M de la palabra. Nunca se usa «isotipo + MESAVERSO».
- **Altura de la M:** el manual sugería 0,70 em. Medido con Familjen Grotesk, la mayúscula mide **0,65 em** (780/1200), así que la M mide 0,65 em de alto y 0,758 em de ancho, con los puntos apoyados en la línea de base. Está verificado con la fuente cargada: M, «E» y «O» comparten la altura de mayúscula y la línea de base.
- **Animación:** solo en el header. Cada 8 s el punto cálido se apaga, reaparece en el inicio y recorre la M (unos 1,8 s). Es SMIL con `begin="indefinite"`, y `app.js` la arranca solo si no está activado «reducir movimiento». Sin JavaScript, el logo queda quieto. El pie y las demás apariciones usan la versión estática.
- **Archivos:** están en `src/brand/` y se publican en `/brand/…`. Se generan con `npm run brand` a partir de `scripts/brand.mjs` (la misma geometría que usa la página). Nunca se editan a mano.

| Archivo | Uso |
|---|---|
| `logo-mesaverso.svg` (= `-dark`) | `[M]ESAVERSO` sobre oscuro: línea Titanio, punto final Luz Cálida, texto Niebla |
| `logo-mesaverso-light.svg` | sobre claro: todo Noche, sin Luz Cálida |
| `logo-mesaverso-black.svg` / `-white.svg` | monocromo |
| `logo-mesaverso-small.svg` | por debajo de ~20 px: trazo 12 y tracking .06em |
| `isotype-mesaverso.svg` / `-light` / `-mono` / `-animated` | solo el isotipo (formatos cuadrados o muy chicos) |
| `app-icon-mesaverso.svg`, `src/favicon.svg` | fondo Noche, radio 23 %, isotipo al 60 % (el favicon usa trazo 12) |
| `src/assets/icon-32.png`, `apple-touch-icon.png` (180), `icon-512.png`, `og.png` | PNG generados con `npm run images` |

## Color

| Token | HEX | Rol |
|---|---|---|
| `--mv-noche` | `#0E1014` | base de la página, alrededor del 55 % |
| `--mv-grafito` | `#2A2D33` | tarjetas y superficies sobre Noche |
| `--mv-titanio` | `#C3C8CE` | logo, íconos, texto secundario |
| `--mv-niebla` | `#F1F2EE` | texto sobre oscuro y fondo de las secciones claras |
| `--mv-luz-calida` | `#FFD6A5` | firma: punto del logo, CTA principal, un detalle por sección |

- **Tintes derivados, no colores nuevos:**
  - `--mv-luz-hover` `#FFD9AC`: hover, 8 % más claro.
  - `--mv-titanio-apagado` `#9A9FA7` y `--mv-grafito-apagado` `#5B5F66`: texto apagado.
  - `--mv-borde-claro` `#DAD6CD`: bordes sobre Niebla.
- **Tres capas:** paleta → roles (`--bg`, `--surface`, `--text`, `--cta-bg`, …) → componentes. Una sección con `.is-light` redefine los roles, así los mismos componentes funcionan sobre Niebla.
- **Secciones claras:** «Sin comisiones» y «Planes». Es menos de 1 de cada 3.
- **Luz Cálida escasa:** el QA mide cada pantalla y en ninguna pasa del 8 % (máximo 7,4 % a 360 px, 2,8 % a 1440 px).
- **Prohibidos:** rojo, naranja y verde de marca, degradés, glow y neón. El QA los busca en todos los estilos calculados de la página. La única excepción es el rosa suave de los errores del formulario, que es funcional y solo aparece cuando hay un error de validación.

## Tipografía

- **Familjen Grotesk 600–700:** titulares (tracking −0,02em) y el wordmark (mayúsculas, tracking .04em).
- **Instrument Sans 400–600:** texto e interfaz. Tiene cifras tabulares para los precios en Gs.
- **IBM Plex Mono 400–500:** solo etiquetas cortas (kickers, badges, «Ver en 3D»), en mayúsculas con tracking .1em.
- **Escala:** H1 40 → 78 px · H2 32 → 52 px · H3 24 → 26 px · cuerpo 17 → 18 px · chico 14 px. `text-wrap: balance` en los titulares y `pretty` en los párrafos.

## Interfaz

- **Radios:** 6 px en tarjetas, pill en botones y chips, 14–18 px en las maquetas de pantalla.
- **Sin sombras, glassmorphism ni degradés.** Los íconos son de línea (2 px, redondeados) en Titanio.
- **Botón primario:** Luz Cálida con texto Noche, uno por vista.
  - En las secciones claras el primario pasa a ser **Noche con texto Niebla**. El manual prohíbe Luz Cálida como texto sobre Niebla, y un botón Luz Cálida sobre Niebla casi no se distingue del fondo.
- **Botón secundario:** contorno de 1 px Titanio (Noche en las secciones claras).
- **Movimiento:** fade/slide de 12 px en 450 ms, sin rebotes. La única animación de marca es la del logo.

## Mockup del celular

- **Modelo:** es el último iPhone, el 18 Pro (salió el 18/09/2026), de frente y con proporciones reales (71,9 × 150 mm).
- **Hardware:**
  - Marco de aluminio en color Plata, dibujado en Titanio. Se descartó el Burgundy porque es rojo y el manual lo prohíbe.
  - Borde negro fino y Dynamic Island más chica (~24 % del ancho).
  - Barra de estado (9:41), indicador de inicio y botones reales: Acción y volumen a la izquierda, lateral y Camera Control a la derecha.
  - Todo plano, sin reflejos, degradés ni sombras.
- **Esquinas:** las del equipo siguen al hardware. El radio de 12–18 px del manual se aplica a la interfaz de adentro.
- **El 3D es lo principal dentro del celular:** la torta real va primera y grande, con la etiqueta «Plato 3D» y el botón «Ver en 3D».
  - El botón carga el modelo 3D real adentro del teléfono, para girarlo con el dedo.
  - Se carga recién al tocar el botón, igual que en la sección 3D, y comparte el mismo visor.
  - Los demás platos siguen como filas tipográficas.

## Decisiones del dueño (sobre los conflictos del manual)

1. **Nada de verde de WhatsApp.**
   - El CTA «Hablar por WhatsApp» del hero y del CTA final es primario en Luz Cálida (texto e ícono en Noche).
   - En las demás secciones los CTA de WhatsApp son secundarios con contorno.
   - El botón flotante es un círculo Luz Cálida con el ícono en Noche; es una excepción funcional a la regla de un solo primario.
   - El ícono de WhatsApp siempre va chico y monocromo. La conversación de WhatsApp de la maqueta también se dibujó neutra.
2. **Header:** el CTA es secundario mientras se ve el hero y pasa a primario después, al hacer scroll.
3. **Sin ilustraciones de platos ni placeholders:**
   - La torta 3D real es la única imagen: aparece en la sección 3D y como plato destacado del celular.
   - Los demás platos son filas tipográficas (nombre, descripción, precio, «+»).
   - También se sacaron los emojis de comida de «rubros».

## Cambios de contenido

- **H1** «Tus pedidos, directo. Sin comisiones.» con el subtítulo «Tu menú en un link. El pedido llega a tu WhatsApp.».
- **Nueva sección «Sin comisiones»:** compara «Con una app de delivery» vs MESAVERSO, solo con texto, sin logos ajenos ni cifras.
- **«Cómo funciona» en 3 pasos:** entra → arma su pedido → te llega por WhatsApp (o se lo muestra al mozo).
- **Sin cambios:** precios, planes, WhatsApp, formulario, FAQ, anclas y datos de la demo. El `<title>` y las metas quedan como estaban, para no tocar el SEO.

## Verificación (`npm run qa`)

- **Responsive:** 360, 390, 430, 768, 1024, 1280, 1440 y 1920 px, sin scroll horizontal, sin texto cortado y con targets de 44 px o más.
- **Marca:**
  - Luz Cálida en ≤ 8 % de cada pantalla.
  - Sin rojo, naranja, verde ni degradés.
  - Logo `[M]ESAVERSO` en el header.
  - Animación de 8 s, que queda quieta con «reducir movimiento».
- **Funcionalidad:** los 11 links de WhatsApp con su mensaje, los precios, la demo del menú, el 3D, el formulario, la FAQ y el menú móvil.
- **Archivos:** SVG de marca, PNG, manifest y favicon.
- **Contraste:** un escaneo aparte de todos los textos (390 y 1440 px) da ≥ AA.
