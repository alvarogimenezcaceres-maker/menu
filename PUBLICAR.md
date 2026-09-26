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

## Probar en tu computadora

```bash
cd site && npm install && npm run build
cd ../dist && python -m http.server 8765    # abrir http://127.0.0.1:8765/filigrana/
```

La realidad aumentada («Ver en mi mesa») solo se puede probar en el celular, con el sitio ya publicado en HTTPS.

## Nuevo restaurante

Copiar `seed/filigrana/` a `seed/<nuevo-slug>/`, reemplazar `menu.json`, las imágenes y los modelos, y hacer push. Queda en `…/<nuevo-slug>/` con su propia hoja de QR.
