#!/usr/bin/env bash
# Mudanza única del panel a la nube (plan gratis):
#   1. copia la base local (restaurantes, platos, usuarios) a Neon
#   2. sube las fotos y modelos 3D de apps/web/media a UploadThing
# Se corre UNA vez, desde Git Bash, en la notebook:   bash infra/migrar-a-la-nube.sh
# Lee la conexión de Neon y el token de UploadThing de .local/nube.env (o los pide sin mostrarlos).
set -euo pipefail
cd "$(dirname "$0")/.."

PG="/c/Program Files/PostgreSQL/18/bin"
LOCAL_URL=$(grep '^DATABASE_URL=' apps/web/.env | cut -d= -f2-)
DUMP=".local/mudanza-neon.backup"

SECRETS=".local/nube.env"
# each value comes from .local/nube.env when it is filled in there (Notepad), otherwise it is asked for
fromfile() { [ -f "$SECRETS" ] && grep -m1 "^$1=" "$SECRETS" | cut -d= -f2- | tr -d '' || true; }
NEON_URL=$(fromfile NEON_URL)
UT_TOKEN=$(fromfile UPLOADTHING_TOKEN)
[ -n "$NEON_URL" ] && echo "→ Conexión de Neon: tomada de $SECRETS" || { read -rsp "Pegá la conexión de Neon (postgresql://...) y Enter: " NEON_URL; echo; }
[ -n "$UT_TOKEN" ] && echo "→ Token de UploadThing: tomado de $SECRETS" || { read -rsp "Pegá el token de UploadThing y Enter: " UT_TOKEN; echo; }

# accept what the dashboards' copy buttons give: psql '...', UPLOADTHING_TOKEN='...', quotes
NEON_URL=$(printf '%s' "$NEON_URL" | sed -E "s/^[[:space:]]*psql[[:space:]]+//; s/^[\"']//; s/[\"'][[:space:]]*$//")
# hidden input makes double pastes easy: keep only the first URL; channel_binding is not needed
NEON_URL=$(printf '%s' "$NEON_URL" | sed -E "s/(.)postgres(ql)?:\/\/.*/\1/; s/[\"' ].*$//; s/[&?]channel_binding=[a-z]*//")
case "$NEON_URL" in *\?*) ;; *) NEON_URL="${NEON_URL/&/?}" ;; esac
UT_TOKEN=$(printf '%s' "$UT_TOKEN" | sed -E "s/^[[:space:]]*(UPLOADTHING_TOKEN=)+//; s/^[\"']//; s/[\"'][[:space:]]*$//")
case "$NEON_URL" in postgres://*|postgresql://*) ;; *) echo "Eso no parece una conexión de Neon: tiene que empezar con postgresql:// y llegó \"${NEON_URL:0:12}…\" (${#NEON_URL} caracteres)."; exit 1 ;; esac
[ -n "$UT_TOKEN" ] || { echo "Falta el token de UploadThing."; exit 1; }
# the v7 token is base64 JSON with apiKey/appId/regions; the sk_live_ key alone is not enough
case "$UT_TOKEN" in sk_live_*) echo "Ese es la Secret Key (sk_live_…). Hace falta el token de la pestaña «SDK v7+» (empieza con eyJ)."; exit 1 ;; esac
if ! { printf '%s' "$UT_TOKEN" | base64 -d 2>/dev/null || true; } | grep -q '"apiKey"'; then
  echo "El token de UploadThing no es válido: llegó \"${UT_TOKEN:0:6}…\" (${#UT_TOKEN} caracteres). Tiene que empezar con eyJ."
  exit 1
fi

echo "→ Revisando la base de Neon…"
tables=$("$PG/psql" "$NEON_URL" -Atc "select count(*) from information_schema.tables where table_schema = 'public'")
copied=$("$PG/psql" "$NEON_URL" -Atc "select count(*) from payload_migrations where name = '20260926_165334_initial'" 2>/dev/null || echo 0)
if [ "$copied" = "1" ]; then
  echo "  La base ya se había copiado en una corrida anterior: sigo con los archivos."
elif [ "$tables" != "0" ]; then
  echo "La base de Neon ya tiene $tables tablas. Frené para no pisar nada."
  exit 1
else
  echo "→ Copiando la base local a Neon…"
  "$PG/pg_dump" "$LOCAL_URL" --format=custom --no-owner --no-acl --file="$DUMP"
  "$PG/pg_restore" --no-owner --no-acl --exit-on-error --dbname="$NEON_URL" "$DUMP"
  rm -f "$DUMP"

  # the local DB was built in dev mode; mark the baseline migration as applied so production
  # only runs the ones after it (UploadThing columns)
  "$PG/psql" "$NEON_URL" -v ON_ERROR_STOP=1 -qc "
    delete from payload_migrations where name = 'dev';
    insert into payload_migrations (name, batch, updated_at, created_at)
    values ('20260926_165334_initial', 1, now(), now());"
fi

echo "→ Subiendo fotos y modelos 3D a UploadThing…"
cd apps/web
NODE_ENV=production DATABASE_URL="$NEON_URL" UPLOADTHING_TOKEN="$UT_TOKEN" \
  npm run --silent payload -- run src/seed/move-media-to-uploadthing.ts

echo
echo "✔ Mudanza terminada. Avisale a Claude para seguir con Render."
echo "  (Guardá $SECRETS: Render necesita esos mismos valores.)"
