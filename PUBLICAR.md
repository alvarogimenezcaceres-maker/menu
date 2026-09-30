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
- Es el mismo código que el panel en la nube (`apps/web`); lo que cambie en uno cambia en el otro.
- **Cargar otro restaurante** desde un `seed/<slug>/menu.json`: `cd apps/web && npm run seed -- <slug>`.

## Generar un modelo 3D desde fotos (fotogrametría, en la notebook)

Herramientas open source portables en `.local/tools/` (COLMAP 4.2 sin CUDA, OpenMVS 2.4) más Blender 4.5 LTS instalado. Todo corre en la CPU: no hace falta placa NVIDIA, pero es más lento.

**Es el mismo código que corre en la nube** (`workers/3d/pipeline.py`): solo cambia dónde están las herramientas (variables `COLMAP_EXE`, `OPENMVS_DIR` y `BLENDER_EXE`). El GLB sale igual en los dos lados. Ver «Tamaño y capacidad» más abajo.

1. Poné 40–80 fotos del plato en `.local/fotogrametria/<plato>/images/` (JPG). Seguí la guía de captura: `docs/04-photogrammetry-pipeline.md` §13.5.
2. Corré:
   ```bash
   python workers/3d/pipeline.py .local/fotogrametria/<plato> --diameter-cm 27 --quality fast
   ```
   Si una etapa falla, al volver a correrlo retoma desde ahí. Hay un log por etapa en `logs/`.
3. El resultado queda en `out/model-web.glb` (≈1,4 MB) y `poster.png`. Subilo desde el panel en el campo **Modelo 3D** del plato, o con:
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

### Analítica de los menús (desde el 29/09/2026)

Cada menú cuenta, de forma anónima, visitas, platos mirados, búsquedas, platos agregados, listas abiertas y toques en «Enviar pedido» (con su total). No usa cookies ni guarda IP, nombre, teléfono, dirección ni el texto del pedido. El mensaje de WhatsApp termina con **#MV** para que el local cuente los pedidos que le llegan.

- **Cómo funciona:** el menú manda los eventos a `/e` 5 segundos después del último, al ocultarse la página y al tocar «Enviar pedido» (los celulares pueden cerrar una pestaña oculta antes de que salga el envío). Solo esa ruta ejecuta `site/worker.js` (validación en `site/events.js`), que los guarda en **Analytics Engine** (dataset `mesaverso_menu_events`, 3 meses). Si falla, el menú sigue funcionando igual. En GitHub Pages `/e` no existe y no pasa nada.
- **Origen de la visita:** agregar `?s=` al link según dónde se comparte: `?s=ig` (Instagram), `?s=maps` (Google Maps), `?s=wa` (WhatsApp), `?s=fb` (Facebook), `?s=web`. Los QR ya llevan `?s=qr` (y los de mesa cuentan como QR). Sin marca, la visita sale como «Directo».
- **Reporte del mes** (en la notebook, nunca en Actions porque el repo es público):
  1. Una sola vez: en Cloudflare, *My Profile → API Tokens → Create Token*, permiso **Account → Account Analytics → Read**. Crear `.local/cloudflare-analytics.env` con dos líneas: `CF_ACCOUNT_ID=` y `CF_ANALYTICS_TOKEN=` seguidas del valor.
  2. Cada mes: `node site/stats-month.mjs 2026-10` → deja un texto por local en `negocio/reportes/2026-10/`, listo para pegar en WhatsApp. El ahorro se calcula con una comisión de app del 10 %.
- **Pruebas:** `node --test site/worker.test.mjs site/order-core.test.mjs` (también corren en `deploy-menus.yml` antes de publicar).

### Pedidos: opciones con precio y datos de entrega

- **Opciones del plato** (panel → plato → «Opciones para elegir»): cada grupo tiene sus opciones con **precio extra** (0 = sin cargo), «Se pueden elegir varias» y «Obligatorio». Ej.: *Tamaño* (obligatorio) → Mediana, Grande +₲ 15.000; *Extras* (varias, opcional) → Cheddar +₲ 5.000. Si un grupo obligatorio suma precio, la lista muestra «desde ₲…». El cliente también puede escribir una **aclaración** por plato («sin cebolla»).
- **Datos del pedido** (panel → restaurante → «Pedidos por WhatsApp»): delivery y/o retiro, costo de envío fijo o **zonas** con su costo, **pedido mínimo** para delivery, **formas de pago** (efectivo con vuelto, transferencia, QR, tarjeta al recibir), **datos para transferir** y **horarios** en hora de Paraguay (si cierra después de medianoche, se carga igual: 18:00 a 02:00). Fuera de horario el menú se ve, pero no deja mandar el pedido. Sin horarios, siempre abierto.
- Sin nada cargado, el menú pide delivery o retiro, nombre, dirección y efectivo o transferencia, con el envío «a confirmar».
- El nombre y la dirección del cliente se guardan **solo en su celular** para la próxima vez y viajan en el mensaje de WhatsApp; la analítica sigue sin guardar datos personales.
- En la mesa (QR con `?mesa=`) no se piden datos ni aplica el horario.
- Los platos con opciones cargadas antes del 29/09/2026 siguen funcionando (sin precio extra); al guardarlos en el panel pasan al formato nuevo.
- **Capacidad:** plan gratis hasta ≈ 300 locales (100.000 eventos y requests por día); después Workers Paid, US$5/mes.

### Caja del local (fase 1, desde el 29/09/2026)

Pantalla para que el local reciba los pedidos del menú, los acepte, agregue ítems y registre el pago. Corre en el
mismo Worker (`/api/<slug>/…`, Durable Object `Caja` con SQLite, plan gratis). El cobro se hace **por fuera**: la caja
solo registra cómo se pagó. Diseño y plan: `plan/pos/` (gitignoreado).

- **Dirección de la pantalla:** `https://menu3d-demo.alvarogimenezcaceres.workers.dev/<slug>/caja/`, en la tablet
  o el celular del local.
- **Una sola vez para todos los locales (el dueño):**
  1. `node site/caja-codigo.mjs --init` crea `.local/caja.env` con un secreto nuevo. No se imprime.
  2. En Cloudflare: **Workers & Pages → menu3d-demo → Settings → Variables and Secrets → Add**, tipo **Secret**,
     nombre `CAJA_SECRET`, y pegá **solo el valor** (lo que está después de `CAJA_SECRET=` en ese archivo).
     Sin este secreto, la caja responde «todavía no está habilitada» y el menú sigue funcionando igual.
- **Activar un local:** `node site/caja-codigo.mjs <slug>` muestra su **código del local** (XXXX-XXXX-XXXX). El
  encargado lo escribe en la pantalla de la caja con su nombre y un PIN de 4 números: queda como **encargado**. Desde
  «Equipo» suma a los demás (mozo, cajero, encargado), vincula otras tablets y puede generar un código nuevo (el del
  script deja de servir).
- **Qué hace cada rol:** el mozo acepta, carga y agrega ítems; el cajero además registra pagos y rendiciones; el
  encargado además cancela pedidos aceptados y maneja el equipo.
- **Circuito:** el pedido del menú llega como «Nuevo» con sonido y su código (`#MV-K7Q2`, el mismo que ve el cliente en
  WhatsApp) → Aceptar → En cocina → «Salió el delivery» o «Listo» → se cierra cuando está **entregado y pagado**
  («Pago recibido», «Cobrar y entregar» o, en delivery en efectivo, «Rendido» cuando vuelve el delivery).
- **Privacidad:** si el local no activó la caja, el Worker no guarda nada. Si la activó, nombre y dirección del
  cliente se borran solos 30 días después de cerrada la venta. Las claves del personal nunca pasan por git (el PIN se
  guarda como HMAC con el secreto) y 5 PIN mal puestos bloquean 10 minutos.
- **Capacidad:** plan gratis ≈ 40–50 locales con salón (100.000 requests y 100.000 filas escritas por día).
- **Probar en la notebook:** `cd site && node build.mjs`, después desde la raíz
  `npx wrangler@4 dev --port 8799 --var CAJA_SECRET:prueba` y abrir `http://127.0.0.1:8799/<slug>/caja/`.
- **Pruebas:** `node --test site/caja-core.test.mjs` (también en `deploy-menus.yml`).
- **Mesas (fase 2a):** el menú tiene **un solo QR** (el general). El cliente arma su pedido y toca «Mostrar al mozo»:
  su celular muestra un QR y 4 letras. El mozo lo lee con la cámara de su celular (vinculado a la caja), o con
  «Tomar pedido de mesa» → «Escanear» (Android) o escribiendo las letras, **elige la mesa** y la abre. Si la mesa ya
  está abierta, el pedido se suma. Cada celular aparece con un color (Azul, Verde…). El mozo agrega ítems; el cajero
  cobra el total y la mesa se cierra. El código del pedido dura 30 minutos.
- **Todavía no:** QR de la mesa para que se sumen los demás y cuenta en vivo en el celular (2b), dividir la cuenta (2c),
  comanda en PDF (3), cierre por turno (4) y precios en vivo (5).

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
  - `WORKER_SECRET`: el mismo valor que el secreto de GitHub (ver abajo).

  Copia local en `.local/render.env`, sin el token de GitHub.
- **Al cargar una variable, pegá solo el valor.** Nunca la línea entera `NOMBRE=valor` ni las comillas. Ejemplo: `UPLOADTHING_TOKEN` empieza con `eyJ`.

## Generar 3D desde fotos (en la nube, desde el 26/09/2026)

La fotogrametría corre gratis en GitHub Actions (el repo es público) con `.github/workflows/photogrammetry.yml`: COLMAP 3.9 (apt), OpenMVS 2.4 y Blender 4.5 LTS sobre Ubuntu. La notebook no hace falta.

**En el panel:**

1. Abrí el plato → **«Generar 3D desde fotos»**. Se crea un **Escaneo 3D**.
2. Completá el **diámetro real** en cm y subí **40 a 80 fotos JPG** (mínimo 30, máximo 120). Seguí la guía de captura: `docs/04-photogrammetry-pipeline.md` §13.5.
3. **Guardar** → **Generar 3D**. El estado pasa a *En cola* → *Procesando* → *Listo* (o *Falló*), con un link al proceso en GitHub.
   - Tarda unos **15 minutos**; se puede cerrar la página.
4. Al terminar, el modelo queda en el campo **Modelo 3D** del plato. El póster se usa como foto si el plato no tenía, o si la que tenía era el póster de un escaneo anterior. Una foto subida a mano nunca se reemplaza.
   - El modelo anterior (y el póster anterior, si se reemplazó) se borra de UploadThing, salvo que otro plato, sección o restaurante lo use. El menú ya publicado no se rompe: tiene su propia copia hasta el próximo «Publicar ahora».
5. Restaurante → **Publicar ahora**.

**Qué pasa por detrás:**

- «Generar 3D» commitea `jobs/3d/<id>.json` (solo números) y ese push arranca el workflow.
- El workflow le pide al panel las direcciones de las fotos y le devuelve el GLB y el póster. Las dos llamadas van firmadas con HMAC-SHA256 (`WORKER_SECRET`) y vencen a los 5 minutos.
- Al terminar, bien o mal, **las fotos se borran de UploadThing** para no pasar de los 2 GB gratis. Si falló, hay que subir fotos nuevas.
- El personal de un restaurante solo puede escanear platos de su restaurante.

**Tamaño y capacidad (medido el 26/09/2026 con la torta de prueba):**

- Cada modelo queda en **≈1,4 MB** (antes 4,5 MB): 40.000 triángulos con normales suaves y textura JPEG de 2048 px, sin compresión de malla. El validador de Khronos da 0 errores.
- No se usa Draco, meshopt ni WebP: Scene Viewer (el AR de Android) no los tiene en su lista de extensiones soportadas. Así, el GLB no exige ninguna extensión.
- Por plato escaneado se guardan ≈2 MB en UploadThing: el GLB más el póster PNG (≈0,6 MB).
- Si cambia la etapa 6 (`workers/3d/optimize.mjs`), hay que actualizar este bloque, `CLAUDE.md` y `docs/04-photogrammetry-pipeline.md` §13.2.1.
- **Capacidad del plan gratis (2 GB):** dejando ≈300 MB libres para las fotos de un escaneo en curso, entran unos **140 restaurantes con 6 platos en 3D** (antes unos 55). No incluye las fotos normales de los platos.

**Secretos (una sola vez):**

- GitHub → repo → Settings → Secrets and variables → Actions:
  - `WORKER_SECRET`
  - `PANEL_URL` = `https://menu3d-panel.onrender.com`
- Render → `menu3d-panel` → Environment: `WORKER_SECRET` con **el mismo valor**.
- El valor está en `.local/worker.env` (no se sube).

**Probar sin el panel:**

1. Subí un `images.zip` con las fotos a un release temporal:
   ```bash
   gh release create test-data-torta images.zip --prerelease --title "Fotos de prueba (temporal)" --notes "Temporal"
   ```
2. Actions → *Fotogrametría* → **Run workflow** con el número de escaneo vacío. El resultado queda como artefacto del run.
3. Borrá el release:
   ```bash
   gh release delete test-data-torta --cleanup-tag --yes
   ```

**Si falla:** el panel muestra la etapa que falló. Los logs quedan 3 días como artefacto del run (sin fotos ni modelo).

La versión para la notebook (sección de arriba) sigue funcionando igual.
