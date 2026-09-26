# Publicar el piloto en GitHub Pages

Cada restaurante es una carpeta `seed/<slug>/` con su `menu.json`, fotos y modelos 3D. Al hacer `git push`, GitHub Actions genera el sitio estático y lo publica en Pages. Tarda unos 2 minutos.

## Una sola vez

1. **Crear el repo** en GitHub, por ejemplo `menu`.
   - En el plan gratis tiene que ser **público** para usar Pages.
   - `negocio/` y los PDF quedan fuera por `.gitignore`.
   - Las notas internas de cada cliente van en `negocio/` (no se suben).
2. **Subir el proyecto** desde esta carpeta:
   ```bash
   git init -b main
   git add .
   git commit -m "Piloto: menú de Filigrana"
   git remote add origin https://github.com/<tu-usuario>/menu.git
   git push -u origin main
   ```
3. **Activar Pages:** repo → Settings → Pages → *Build and deployment* → Source: **GitHub Actions**.
4. **(Recomendado) Dominio propio** antes de imprimir los QR:
   - En tu proveedor de DNS: registro **CNAME** `menu` → `<tu-usuario>.github.io`.
   - Repo → Settings → Pages → *Custom domain*: `menu.tudominio.com` → marcar **Enforce HTTPS**.
   - Repo → Settings → Secrets and variables → Actions → **Variables**:
     - `SITE_URL` = `https://menu.tudominio.com/`
     - `CUSTOM_DOMAIN` = `menu.tudominio.com`
   - Actions → *Publicar menús* → **Run workflow**, para regenerar los QR con el dominio.

Sin dominio propio, el menú queda en `https://<tu-usuario>.github.io/menu/filigrana/`. Funciona igual, pero si después cambiás de dirección hay que reimprimir los QR.

## Direcciones

| Qué | Dirección |
|---|---|
| Menú | `…/filigrana/` |
| Menú desde la mesa 8 | `…/filigrana/?table=8` |
| Abrir directo un plato | `…/filigrana/#pizza-margarita` |
| **Hoja de QR para imprimir** (general + 20 mesas) | `…/filigrana/qr/` |

## Cambiar el menú

- **Desde la web de GitHub:** abrir `seed/filigrana/menu.json` → ícono del lápiz → editar precio o texto → *Commit changes*. En ~2 minutos está publicado.
- **Ocultar un plato:** agregar `"status": "draft"`. Un plato sin precio (`"price": null`) nunca se publica.
- **Agregar foto:** subir el PNG a `seed/filigrana/images/` y poner `"photo": "<nombre-sin-extensión>"` en el plato.
- **Agregar modelo 3D:** subir el `.glb` a `seed/filigrana/models/` y poner `"model": "<archivo>.glb"` en el plato.
- **Pedidos por WhatsApp:** poner `"whatsapp": "0976 145 539"` en `restaurant` (o el campo *WhatsApp para pedidos* del panel). En «Mi selección» aparece «Enviar pedido por WhatsApp»; «Mostrar al mozo» está siempre. Si el QR es de una mesa, el pedido lleva el número de mesa.

## Probar en tu computadora

```bash
cd site && npm install && npm run build
cd ../dist && python -m http.server 8765    # abrir http://127.0.0.1:8765/filigrana/
```

La realidad aumentada («Ver en mi mesa») solo se puede probar en el celular, con el sitio ya publicado en HTTPS.

## Nuevo restaurante

Copiar `seed/filigrana/` a `seed/<nuevo-slug>/`, reemplazar `menu.json`, las imágenes y los modelos, y hacer push. Queda en `…/<nuevo-slug>/` con su propia hoja de QR.

## Panel de administración (en la notebook)

El panel (Payload CMS) corre en tu notebook y publica en GitHub Pages con un botón. Si la notebook está apagada, el menú en línea sigue funcionando; solo se pausan las ediciones.

- **Iniciar:** doble clic en `iniciar-panel.cmd`. Se abre http://localhost:3100/admin (la primera carga tarda ~30 s).
- **Usuarios y claves:** `.local/credenciales.txt` (no se sube al repo).
  - `admin@menu3d.local`: ve todos los restaurantes y puede crear nuevos.
  - `filigrana@menu3d.local`: el personal de Filigrana; solo ve su restaurante.
  - `gringo-bar@menu3d.local`: el personal de Gringo Bar; solo ve su restaurante.
- **Flujo:** editar platos o precios → *Guardar* → Restaurantes → Filigrana → **Publicar ahora**. En 1–2 minutos se ve en el QR.
- **Datos:** base PostgreSQL propia en `.local/pgdata` (puerto 55433); fotos y modelos en `apps/web/media/`.
- **Cargar otro restaurante** desde un `seed/<slug>/menu.json`: `cd apps/web && npm run seed -- <slug>`.

## Generar un modelo 3D desde fotos (fotogrametría, en la notebook)

Herramientas open source portables en `.local/tools/` (COLMAP 4.2 sin CUDA, OpenMVS 2.4) más Blender 4.5 LTS instalado. Todo corre en la CPU: no hace falta placa NVIDIA, pero es más lento.

1. Poné 40–80 fotos del plato en `.local/fotogrametria/<plato>/images/` (JPG). Seguí la guía de captura: `docs/04-photogrammetry-pipeline.md` §13.5.
2. Corré:
   ```bash
   python workers/3d/pipeline.py .local/fotogrametria/<plato> --diameter-cm 27 --quality fast
   ```
   Si una etapa falla, al volver a correrlo retoma desde ahí. Hay un log por etapa en `logs/`.
3. El resultado queda en `out/model-web.glb` (y `poster.png`). Subilo desde el panel en el campo **Modelo 3D** del plato, o con:
   ```bash
   cd apps/web && npm run attach-model -- <restaurante> <plato> ../../.local/fotogrametria/<plato>/out/model-web.glb ../../.local/fotogrametria/<plato>/out/poster.png "Nota"
   ```
4. Restaurante → **Publicar ahora**.

`workers/3d/render_views.py` es **solo para demostración**: simula una sesión de fotos renderizando un modelo escaneado.

## Menú público en Cloudflare (desde el 26/09/2026)

Los menús se publican en **Cloudflare Workers** (archivos estáticos, plan gratis):
**https://menu3d-demo.alvarogimenezcaceres.workers.dev/** (`/filigrana/`, `/gringo-bar/`, `…/qr/` para la hoja de QR).

- **Publicar desde el panel:** «Publicar ahora» hace el push y además, en segundo plano, reconstruye y sube el sitio a Cloudflare (≈1 min). El registro queda en `.local/deploy-cloudflare.log`.
- **Publicar a mano:**
  ```bash
  node site/deploy-cloudflare.mjs
  ```
  La primera vez en una máquina nueva hay que iniciar sesión con `npx wrangler login`.
- **Configuración:** `wrangler.jsonc` (proyecto `menu3d-demo`). Los encabezados de respuesta (formato de modelos 3D, permiso de cámara para AR) los genera `site/build.mjs` en `dist/_headers`.
- **Dominio propio (más adelante):** agregarlo en Cloudflare y correr `CF_SITE_URL=https://menu.tudominio.com/ node site/deploy-cloudflare.mjs`, para regenerar los QR con esa dirección.
- **GitHub Pages** sigue publicando en paralelo hasta que decidamos apagarlo.

## Todo en la nube (desde el 26/09/2026): la notebook ya no hace falta

| Pieza | Dónde | Dirección |
|---|---|---|
| Panel de administración | Render (plan gratis, imagen `ghcr.io/alvarogimenezcaceres-maker/menu3d-panel:latest`) | https://menu3d-panel.onrender.com/admin |
| Base de datos | Neon (PostgreSQL, São Paulo) | — |
| Fotos y modelos 3D | UploadThing (direcciones públicas `utfs.io/f/…`) | — |
| Menús públicos | Cloudflare Workers | https://menu3d-demo.alvarogimenezcaceres.workers.dev/ |

- **Publicar:** «Publicar ahora» en el panel hace un commit por la API de GitHub (`GITHUB_TOKEN` en Render). El workflow `deploy-menus.yml` publica en Cloudflare en ~1 minuto.
- **Actualizar el panel después de cambiar su código:**
  1. Al hacer push, GitHub arma la imagen nueva (`panel-image.yml`).
  2. En Render: **Manual Deploy → Deploy latest reference**. Render no la toma sola.
- **Plan gratis de Render:** el panel se duerme a los 15 minutos sin uso; la primera carga después tarda ~1 minuto. El menú público no tiene ese problema.
- **Variables de Render:**
  - `DATABASE_URL`
  - `PAYLOAD_SECRET`
  - `UPLOADTHING_TOKEN`
  - `GITHUB_TOKEN`: token clásico con solo `public_repo`, vence en 1 año; renovarlo antes.
  - `GITHUB_REPO`
  - `GITHUB_BRANCH`
  - `MENU_BASE_URL`
  - `NODE_ENV`

  Copia local en `.local/render.env`, sin el token de GitHub.
- **Pendiente:** la fotogrametría (fotos → 3D) sigue corriendo en la notebook. Pasarla a GitHub Actions.
