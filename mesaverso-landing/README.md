# Mesaverso: landing comercial

Página de venta de Mesaverso. Es independiente de los menús (`site/`) y del panel (`apps/web`).

- **Dirección pública (temporal):** https://mesaverso-landing.alvarogimenezcaceres.workers.dev
- **Dónde corre:** Cloudflare Workers, un Worker propio llamado `mesaverso-landing` (plan gratis). No toca `menu3d-demo`.
- **Stack:** HTML + CSS + JS sin framework. `build.mjs` arma `dist/` y el Worker (`src/worker.js`) solo atiende `/api/lead`.

## Cambiar datos comerciales

Todo está en **`site.config.mjs`**:

| Qué | Variable |
|---|---|
| Número de WhatsApp | `MESAVERSO_WHATSAPP` (solo dígitos) |
| Mensajes que se abren en WhatsApp | `WHATSAPP_MESSAGES` |
| Precios | `PRICES` |
| Dirección pública (canonical, Open Graph, QR) | `SITE_URL` |

Después de cambiar algo: `npm run deploy`.

## Marca y colores

La identidad (manual 5B · Titanio + Luz Cálida, logo `[M]ESAVERSO`) está resumida en **`BRAND-DIRECTION.md`**.

- Los colores están en `:root` de `src/styles.css`, en capas: paleta `--mv-*` → roles → componentes. Una sección con `.is-light` usa fondo Niebla. Los componentes usan solo los roles:

| Rol | Uso |
|---|---|
| `--bg` / `--surface` (Noche `#0E1014` / Grafito `#2A2D33`) | fondo de la página y de las tarjetas |
| `--text` / `--text-2` (Niebla / Titanio `#C3C8CE`) | texto principal y secundario, íconos |
| `--cta-bg` (Luz Cálida `#FFD6A5`) | el único botón primario por vista y el punto del logo (≤ 8 % de la pantalla) |

- No se usa verde de WhatsApp ni ningún rojo, naranja o verde de marca.
- Los logos están en `src/brand/` y se publican en `/brand/…`. Se generan con `npm run brand` desde `scripts/brand.mjs`, que es la misma geometría que usa la página; nunca se editan a mano.
- Las imágenes para compartir y los íconos (`og.png`, `icon-32.png`, `apple-touch-icon.png`, `icon-512.png`) se generan con `npm run images`.

## Publicar

```
cd mesaverso-landing
npm install        # la primera vez
npm run deploy     # arma dist/ y publica en Cloudflare (wrangler tiene que estar logueado)
npm run qa -- https://mesaverso-landing.alvarogimenezcaceres.workers.dev --no-submit
```

`npm run qa` prueba 8 anchos de pantalla (360 a 1920 px), las reglas de marca (Luz Cálida ≤ 8 %, sin verde/rojo/naranja ni degradés, animación del logo), los enlaces de WhatsApp, precios, menú móvil, FAQ, demo, 3D y
formulario. Sin `--no-submit` manda una solicitud de prueba real, que después hay que borrar del KV.

Probar en la compu: `npm run dev` → http://127.0.0.1:8788

## Formulario de demo

Recorrido: navegador → `POST /api/lead` (Worker) → se guarda en KV `LEADS` y se manda por correo con Resend.
El correo de destino es un **secreto del Worker**: no aparece en la página, en el JavaScript ni en este repositorio.

Protecciones: validación en el servidor, campo trampa (honeypot), tiempo mínimo de llenado, solo acepta envíos desde el
mismo sitio, límite de 5 envíos por hora por IP y tamaño máximo.

| Secreto | Estado | Para qué |
|---|---|---|
| `LEAD_TO_EMAIL` | cargado | a dónde llegan las solicitudes |
| `RESEND_API_KEY` | **falta** | para mandar el correo |
| `LEAD_FROM_EMAIL` | opcional | remitente; por defecto `Mesaverso <onboarding@resend.dev>` |
| `ALLOWED_ORIGINS` | opcional | otros dominios que pueden mandar el formulario (durante una mudanza de dominio) |

**Mientras falte `RESEND_API_KEY`, las solicitudes no se pierden:** quedan guardadas en el KV. Para verlas: `npm run leads`.

Para activar el correo:

1. Creá una cuenta gratis en https://resend.com **con el mismo correo que recibe los leads** (el remitente de prueba de Resend solo entrega a la dirección de la cuenta).
2. En Resend → API Keys → Create API key (permiso *Sending access*). Copiá **solo el valor** (empieza con `re_`).
3. En esta carpeta: `npx wrangler secret put RESEND_API_KEY` y pegá el valor.
4. Probá el formulario desde el celular: tiene que llegar el correo.

Cuando tengas dominio propio conviene verificarlo en Resend y cargar `LEAD_FROM_EMAIL` (por ejemplo `Mesaverso <hola@tu-dominio>`).

## Pasar al dominio propio

1. Agregá el dominio en Cloudflare.
2. En `wrangler.jsonc` sumá `"routes": [{ "pattern": "tu-dominio", "custom_domain": true }]`.
3. En `site.config.mjs` cambiá `SITE_URL` (o publicá con `SITE_URL=https://tu-dominio npm run deploy`).
4. `npm run images` no hace falta; el QR del sitio se regenera solo con la nueva dirección.

## Analítica

No hay ningún proveedor instalado. Cada acción importante dispara un evento (`hero_demo_click`, `whatsapp_click`,
`pricing_digital_click`, `pricing_3d_click`, `demo_form_start`, `demo_form_submit`, y otros de la demo). Van a
`window.dataLayer` si existe y como evento `mesaverso:track`. Para sumar un proveedor alcanza con escuchar ese evento.

## Recursos

- El 3D es la torta de prueba del pipeline de fotogrametría (escaneo CC0 de Poly Haven), optimizada con
  `workers/3d/optimize.mjs` (1,4 MB, 0 errores del validador). `model-viewer` se sirve desde este mismo sitio y se carga
  solo cuando alguien toca «Girar en 3D».
- `npm run images` regenera la imagen para compartir (`og.png`) y el ícono de Apple con Chrome.
- Las ilustraciones de los platos de la demo son SVG propios. No hay fotos de stock.
