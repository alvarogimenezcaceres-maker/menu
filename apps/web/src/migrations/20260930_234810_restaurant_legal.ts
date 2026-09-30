import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "restaurants" ADD COLUMN "legal_legal_name" varchar;
  ALTER TABLE "restaurants" ADD COLUMN "legal_ruc" varchar;
  ALTER TABLE "restaurants" ADD COLUMN "legal_address" varchar;
  ALTER TABLE "restaurants" ADD COLUMN "legal_privacy_contact" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "restaurants" DROP COLUMN "legal_legal_name";
  ALTER TABLE "restaurants" DROP COLUMN "legal_ruc";
  ALTER TABLE "restaurants" DROP COLUMN "legal_address";
  ALTER TABLE "restaurants" DROP COLUMN "legal_privacy_contact";`)
}
