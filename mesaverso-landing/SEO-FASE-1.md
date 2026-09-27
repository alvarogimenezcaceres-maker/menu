# Mesaverso: SEO Fase 1

Base técnica, intención de búsqueda, on-page e indexación. Rama `seo-fase-1`, 26/09/2026.
Fuera de esta fase: backlinks, directorios, artículos en masa y compras. Nada de esto promete posiciones ni plazos en Google.

## 1. Estado técnico previo

- **Stack y hosting:** HTML, CSS y JS sin framework. `build.mjs` arma `dist/` (sitio estático). Corre en Cloudflare Workers `mesaverso-landing` con assets estáticos; el Worker solo atiende `/api/lead`.
- **Renderizado:** SSG. El contenido está completo en el HTML inicial y el JS solo agrega interacción.
- **Lo que ya estaba bien:**
  - `lang="es-PY"`.
  - Canonical, OG y sitemap salían de `SITE_URL`.
  - `robots.txt` con `Disallow: /api/`.
  - `/index.html` redirigía a `/` (307).
  - Lighthouse móvil: SEO 100, performance 84, LCP 3,2 s.
- **Problemas:**
  - El title («Mesaverso | Tu menú en otra dimensión») no decía qué es ni dónde.
  - El H1 era solo la tagline.
  - El logo se leía como texto «ESAVERSO» (en el H3 de la comparación decía «Con ESAVERSO»).
  - El JSON-LD tenía un `SoftwareApplication` mínimo.
  - La FAQ usaba `<details>` y no había `FAQPage`.
  - Las fuentes venían de Google Fonts: dos conexiones de terceros y bloqueo de render.
  - El sitemap tenía una sola URL.
  - La imagen OG decía otra frase.
- **Dominio:** `mesaverso-landing.alvarogimenezcaceres.workers.dev`. Es **estable**: un subdominio fijo de workers.dev, sin hash ni preview. Es temporal hasta tener el dominio propio.

## 2. Cliente objetivo

- **Quiénes:** dueños de negocios gastronómicos de Paraguay, con Asunción y Gran Asunción primero. Incluye restaurantes, pizzerías, hamburgueserías, cafeterías, bares, sushi, panaderías, reposterías, food trucks y dark kitchens.
- **Sin local:** también quienes venden solo por Instagram o WhatsApp.
- **Qué le importa:** no pagar comisión por pedido, recibir el pedido ordenado, que el cliente pueda pedir desde su casa y el precio en guaraníes.
- **KPI:** leads orgánicos calificados (formulario de demo y clics a WhatsApp), no visitas.

## 3. Intención de búsqueda

Análisis cualitativo de los resultados de búsqueda. Se buscó desde EE. UU. agregando «Paraguay» y «Asunción», así que es una aproximación de lo que muestra Google en Paraguay.

- **«menú digital» y «menú QR» son la misma intención:** aparecen los mismos jugadores (Recafy, e-Karú, oferraro). Los cubre **una sola página pilar, la home**.
- **«crear menú QR (gratis)» es otra intención:** la dominan los generadores de QR y las herramientas gratis. No es el cliente de Mesaverso.
- **«pedidos por WhatsApp restaurante» tiene sus propios resultados:** otros jugadores (Cartanube, Maspedidos, Takepedido, Cercai) y otro problema (comisiones, desorden del chat). Justifica **una landing propia**.
- **«software para restaurantes Paraguay» es intención de POS y facturación:** e-Karú, Fudo, comparasoftware. No es el producto.
- **«menú 3D restaurante» es un nicho con poca demanda visible:** Mi Menú 3D, DejaVu3D, artículos. El repo público del proyecto sale primero, lo que indica poca competencia, no volumen. Queda sin página propia en esta fase.
- **Búsquedas de consumidores** («pizza cerca de mí», «delivery»): excluidas.

## 4. Keywords priorizadas (volumen: sin dato en todas)

- **T1: comercial alta.**
  - Alta: menú digital para restaurantes · menú digital Paraguay · menú QR restaurante · menú QR Paraguay.
  - Media: menú interactivo · carta digital restaurante (en Paraguay se dice más «menú»).
- **T2: conoce el problema.**
  - Alta: pedidos por WhatsApp restaurante · sistema de pedidos WhatsApp.
  - Media: menú digital sin comisiones · menú para delivery · alternativa a apps de delivery.
- **T3: informativa (Fase 2).** qué es un menú digital · cómo recibir pedidos por WhatsApp · cómo hacer un menú QR.
- **T4: local.** Paraguay y Asunción van en el title, el H1, la description, `areaServed` y el contenido. No se hacen páginas por ciudad.
- **T5: por rubro (Fase 2).**
  - Media: pizzería · hamburguesería · dark kitchen / venta por Instagram.
  - Baja: cafetería · bar · sushi · food truck.
- **3D:** menú 3D restaurante · platos en 3D, prioridad baja-media, como diferencial dentro de la home.

## 5. Competidores

| Competidor | Qué hace bien | Qué hace mal o no explica |
|---|---|---|
| e-Karú (restaurante.com.py) | Es local, con prueba social, páginas por rubro, schema completo y WhatsApp como CTA | Es un POS completo: no muestra precios y su `AggregateRating` no se puede verificar |
| Recafy | Cubre muchas ciudades, «gratis», pedidos por WhatsApp | Una plantilla por ciudad con casi nada de contenido propio |
| resto.oferraro.com | «QR Menu Paraguay» en el title | Es una SPA casi sin texto que Google pueda leer |
| Fudo (es-py) | Páginas por rubro, precios aparte | Es un POS; el schema es solo `WebSite` |
| OlaClick, Meniu | Instalaron el mensaje «sin comisiones» | Son genéricos para LatAm, sin foco en Paraguay |
| Pido.club | Promete el menú en 24 h | Urgencia falsa y cobra comisión |
| Cartanube (/pedidos-por-whatsapp) | Tiene una landing específica para WhatsApp | Es de Argentina, sin precios en la página |
| Cercai (Paraguay) | Contenido local sobre pedidos por WhatsApp | Es una consultoría de chatbot, no un menú |
| Mi Menú 3D | Tiene el nicho 3D/AR | Sin presencia local; no explica cómo se hace el 3D |
| **Indirectos:** PedidosYa, Monchis, catálogo de WhatsApp Business, generadores de QR | | |

**Lo que Mesaverso explica mejor:**

- el precio fijo en guaraníes;
- el flujo completo (link o QR → menú → pedido → mozo o WhatsApp);
- que funciona sin local;
- que es solo menú y pedido, no un POS;
- un 3D real que se puede probar en la página.

## 6. Quick wins (hechos)

- **Metadata:** title y description con qué es, para quién y dónde.
- **H1:** producto + tagline.
- **Mensaje clave:** «aunque no tengas local», en el hero.
- **Logo:** ahora se lee «Mesaverso».
- **Fuentes:** alojadas en el propio sitio, sin terceros; LCP de 3,2 a 2,5 s.
- **FAQ:** acordeón accesible con `FAQPage` igual a la FAQ visible.
- **JSON-LD:** completo y honesto.
- **Landing nueva:** `/pedidos-por-whatsapp/`.
- **Imagen OG:** con «Tu menú. Ahora en otra dimensión.».

## 7. Mapa keyword → URL

| Búsqueda principal | Intención | Cliente | Valor | URL | Prioridad |
|---|---|---|---|---|---|
| menú digital / menú QR para restaurantes (Paraguay) | T1 + T4 | Cualquier negocio gastronómico | Alto | `/` | Alta |
| pedidos por WhatsApp restaurante / sistema de pedidos WhatsApp / sin comisiones | T1 + T2 | Delivery, Instagram, dark kitchens, locales | Alto | `/pedidos-por-whatsapp/` | Alta |
| menú 3D restaurante / platos en 3D | nicho | Negocios que quieren diferenciarse | Medio | `/#3d` (sección) | Media |
| menú interactivo / carta digital | T1/T3 | General | Medio | `/` (términos secundarios) | Media |
| menú digital para pizzería / hamburguesería / dark kitchen | T5 | Rubro | Medio | Fase 2: `/menu-digital-pizzeria/`, etc. | Fase 2 |
| qué es un menú digital / cómo recibir pedidos por WhatsApp | T3 | Informativa | Bajo-medio | Fase 2 (artículos) | Fase 2 |

## 8. Cambios implementados

- **Build multipágina:** `src/content.mjs` (metadata y FAQ) + `src/partials/` (head, íconos, header, footer) + `src/pages/`. Metadata, canonical, OG, JSON-LD y sitemap salen de `SITE_URL` y de `PAGES`.
- **Home:**
  - H1 «Menú digital para restaurantes en Paraguay · Tus pedidos, directo. Sin comisiones.», con el subtítulo semántico y «aunque no tengas local».
  - H2 más descriptivos: «Pedidos directo a tu WhatsApp…», «QR o link: tu cliente entra desde donde esté.», «Planes y precios». El H3 del local ahora dice «Mostrale el pedido al mozo».
  - FAQ con 11 preguntas reales.
  - CTA final con «Tu menú. Ahora en otra dimensión.».
  - Enlaces internos a la landing.
- **Landing `/pedidos-por-whatsapp/`:** contenido propio (el problema del pedido por chat, 3 pasos, ejemplo del mensaje, sin comisión con precios reales, para quién sirve y 5 preguntas propias), breadcrumb visible y en JSON-LD, y enlaces a `/#planes`, `/#como-funciona` y `/#3d`.
- **Footer:** enlace «Pedidos por WhatsApp».
- **JS:** tolera páginas sin demo, 3D o formulario; acordeón accesible; eventos de analítica sin cambios.
- **Fuentes:** WOFF2 latin propias (Familjen e Instrument son variables; Plex Mono solo 400 y 500), `font-display: swap`, precarga solo de Familjen (la del H1). CSP sin Google Fonts.
- **Imágenes:**
  - `torta-de-zanahoria-3d-480/800.webp` con `srcset`, `width` y `height`, y alt descriptivo.
  - La del celular del hero lleva `fetchpriority="high"`; la de la sección 3D, `lazy`.
  - El GLB se renombró a `torta-de-zanahoria-3d.glb` y se carga solo al tocar «Ver en 3D».
  - Se borraron la miniatura y el webp viejos.
- **Imagen OG:** fondo Noche, `[M]ESAVERSO` y «Tu menú. Ahora en otra dimensión.».
- **Preview:** `PREVIEW=1` agrega `noindex` (meta y `X-Robots-Tag`) y un robots.txt que bloquea todo. El canonical sigue apuntando a producción.
- **QA:** por cada URL del sitemap controla 200, title/description, un solo H1, canonical, robots, OG, JSON-LD válido y honesto, FAQ igual a la visible, alt/width/height, sin email, enlaces internos 200 y móvil 360/390/430.

## 9. Metadata final

| URL | Title | Description |
|---|---|---|
| `/` | Menú digital QR para restaurantes en Paraguay \| Mesaverso (57) | Menú digital con QR o link para restaurantes y negocios gastronómicos de Paraguay. Tus clientes te piden por WhatsApp, sin comisión por pedido. (143) |
| `/pedidos-por-whatsapp/` | Pedidos por WhatsApp para restaurantes \| Mesaverso (50) | Tu cliente arma el pedido en tu menú digital y te llega listo a tu WhatsApp, con productos y total. Sin comisión por pedido, con o sin local. (141) |

`og:description` empieza con «Tu menú. Ahora en otra dimensión.».

## 10. Datos estructurados y por qué

Un `@graph` por página con:

- **Organization:** nombre, url, logo PNG 512×512 y `contactPoint` de ventas por WhatsApp. Sin `sameAs`: no hay perfiles reales publicados.
- **WebSite.**
- **WebPage.**
- **Service:** `serviceType` «Menú digital interactivo…», `areaServed` Paraguay, `audience` BusinessAudience y `offers` con los 4 precios reales en PYG (los planes con `UnitPriceSpecification` mensual).
  - **Por qué Service y no SoftwareApplication:** Mesaverso se vende como servicio gestionado, con implementación y carga del menú. Además, SoftwareApplication solo tiene rich result con ratings, y no los hay.
- **FAQPage:** generado desde la misma fuente que la FAQ visible, así coincide siempre. Google casi no muestra estos rich results para sitios comerciales.
- **BreadcrumbList:** en la landing.
- **Qué no se usa:** `LocalBusiness` (no hay dirección pública), `aggregateRating`, `review`. El QA falla si aparecen.

## 11. Sitemap, robots y canonical

- **`sitemap.xml`:** se genera desde `PAGES`, solo con las URLs canónicas indexables (`/` y `/pedidos-por-whatsapp/`) y `lastmod`.
- **`robots.txt`:** `Allow: /`, `Disallow: /api/` y `Sitemap:`. No bloquea CSS, JS ni imágenes.
- **Canonical:** absoluto y autorreferente en cada página. El build falla si `SITE_URL` no es un origen https estable (sin localhost).
- **URLs únicas:** Cloudflare `auto-trailing-slash`, así que `/pedidos-por-whatsapp` redirige a `/pedidos-por-whatsapp/` y `/index.html` a `/`.
- **Páginas `noindex`:** `/gracias` (meta y header) y 404. Quedan fuera del sitemap.

## 12. Rendimiento (Lighthouse móvil, laboratorio)

| | Performance | LCP | CLS | TBT |
|---|---|---|---|---|
| Home antes (producción) | 84 | 3,2 s | 0 | 120 ms |
| Home después (preview) | 89 | 2,5 s | 0,013 | 210 ms |
| `/pedidos-por-whatsapp/` (preview) | 97 | 2,1 s | 0 | 50 ms |

- Accesibilidad y Best Practices: 100 en todas.
- El modelo 3D nunca es el LCP: carga solo al tocar el botón.
- El TBT medido varía entre corridas.

## 13. Mobile

- **QA:** 360, 390, 430, 768, 1024, 1280, 1440 y 1920 px en la home, y 360, 390 y 430 px en la landing.
  - Sin scroll horizontal ni texto cortado, con botones de 44 px o más (los links dentro de una frase quedan exentos por WCAG 2.5.8).
  - Navbar, CTA, precios, FAQ y formulario, verificados.
- **Sin keywords ocultas:** no hay bloques de keywords que se muestren u oculten según el tamaño de pantalla.

## 14. Oportunidades de contenido para la Fase 2

- **Rubros:**
  - Primero: `/menu-digital-pizzeria/`, `/menu-digital-hamburgueseria/`, `/menu-para-vender-por-instagram/` (o dark kitchen).
  - Después: cafetería, bar, sushi, food truck.
  - Cada una con contenido real del rubro (combos, gustos, variantes, horarios de pico), nunca una plantilla.
- **Artículos T3:** «Qué es un menú digital y cómo elegir uno» · «Cómo recibir pedidos por WhatsApp sin perder mensajes» · «Menú QR: cómo imprimirlo y dónde ponerlo» · «Apps de delivery vs pedidos directos: qué conviene».
- **3D:** una página `/menu-3d/` solo si Search Console muestra impresiones reales para «menú 3D», o para usarla en prensa y redes.
- **Prueba social:** casos reales de clientes (Filigrana, Gringo Bar), con permiso y datos verificables.

## 15. Migración de dominio (checklist)

- [ ] Comprar el dominio.
- [ ] Agregarlo a Cloudflare (DNS en Cloudflare).
- [ ] `wrangler.jsonc` → `"routes": [{ "pattern": "<dominio>", "custom_domain": true }]` (HTTPS automático).
- [ ] Cambiar `SITE_URL` en `site.config.mjs` (o `SITE_URL=https://<dominio> npm run deploy`). Canonical, sitemap, OG, schema y robots se actualizan solos.
- [ ] 301 desde `mesaverso-landing.*.workers.dev` al dominio nuevo. Con Workers se hace con una regla de redirección en Cloudflare, o en `src/worker.js` con `run_worker_first` si el host es `*.workers.dev`. También se puede desactivar `workers_dev` después del 301.
- [ ] `ALLOWED_ORIGINS` del formulario, si hace falta durante la mudanza.
- [ ] Verificar la imagen OG y el schema con la URL nueva (`npm run qa -- https://<dominio> --no-submit`).
- [ ] Google Search Console: propiedad de dominio con verificación DNS (TXT en Cloudflare).
- [ ] Enviar `https://<dominio>/sitemap.xml`.
- [ ] Inspección de URL de `/` y `/pedidos-por-whatsapp/` → «Solicitar indexación».
- [ ] Bing Webmaster Tools (importar desde Search Console).

## 16. Fase 2: próximas acciones

1. Dominio propio y Search Console (sección 15).
2. Medir 4 a 6 semanas: impresiones y consultas reales. Recién ahí fijar keywords con datos.
3. Landings por rubro (sección 14), una por vez, según lo que muestre Search Console.
4. 2 a 4 artículos T3 útiles.
5. Autoridad: perfiles reales (Instagram, Google Business Profile solo si hay dirección pública), menciones de clientes y medios locales. Sin comprar enlaces.
6. Conectar la analítica: los eventos `hero_demo_click`, `whatsapp_click`, `pricing_digital_click`, `pricing_3d_click`, `demo_form_start` y `demo_form_submit` ya se emiten a `window.dataLayer` y como evento `mesaverso:track`.

## 17. Cómo revertir el deploy

- **Versión de producción anterior a esta fase:** `5be52225-8dd1-4101-979c-83ddb8084816` (Worker `mesaverso-landing`).
- **Revertir el deploy** (desde `mesaverso-landing/`):

  ```
  npx wrangler rollback 5be52225-8dd1-4101-979c-83ddb8084816 --message "Revert SEO fase 1"
  ```

- **Revertir el código:**
  - La rama `seo-fase-1` no está mergeada a `main`, así que alcanza con no mergearla. Si ya se mergeó, usar `git revert <commit>`.
  - Después, `npm run deploy` desde `main`.
- **Ver versiones:** `npx wrangler deployments list`.
