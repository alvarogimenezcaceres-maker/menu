import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Public location of each restaurant (address, barrio, city) for the menu, structured data and zone pages.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "public_address" varchar;
   ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "neighborhood" varchar;
   ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "city" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "restaurants" DROP COLUMN IF EXISTS "public_address";
   ALTER TABLE "restaurants" DROP COLUMN IF EXISTS "neighborhood";
   ALTER TABLE "restaurants" DROP COLUMN IF EXISTS "city";`)
}
