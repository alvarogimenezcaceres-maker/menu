#!/usr/bin/env bash
# Mudanza única del panel a la nube (plan gratis):
#   1. copia la base local (restaurantes, platos, usuarios) a Neon
#   2. sube las fotos y modelos 3D de apps/web/media a UploadThing
# Se corre UNA vez, desde Git Bash, en la notebook:   bash infra/migrar-a-la-nube.sh
# Pide la conexión de Neon y el token de UploadThing sin mostrarlos en pantalla.
set -euo pipefail
cd "$(dirname "$0")/.."

PG="/c/Program Files/PostgreSQL/18/bin"
LOCAL_URL=$(grep '^DATABASE_URL=' apps/web/.env | cut -d= -f2-)
DUMP=".local/mudanza-neon.backup"

read -rsp "Pegá la conexión de Neon (postgresql://...) y Enter: " NEON_URL; echo
read -rsp "Pegá el token de UploadThing y Enter: " UT_TOKEN; echo

echo "→ Revisando que la base de Neon esté vacía…"
tables=$("$PG/psql" "$NEON_URL" -Atc "select count(*) from information_schema.tables where table_schema = 'public'")
if [ "$tables" != "0" ]; then
  echo "La base de Neon ya tiene $tables tablas. Frené para no pisar nada."
  exit 1
fi

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

echo "→ Subiendo fotos y modelos 3D a UploadThing…"
cd apps/web
NODE_ENV=production DATABASE_URL="$NEON_URL" UPLOADTHING_TOKEN="$UT_TOKEN" \
  npm run --silent payload -- run src/seed/move-media-to-uploadthing.ts

echo
echo "✔ Mudanza terminada. Avisale a Claude para seguir con Render."
