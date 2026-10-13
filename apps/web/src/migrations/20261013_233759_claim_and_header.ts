import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "restaurants" ADD COLUMN "header_center" boolean DEFAULT false;
  ALTER TABLE "restaurants" ADD COLUMN "claim_code" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "restaurants" DROP COLUMN "header_center";
  ALTER TABLE "restaurants" DROP COLUMN "claim_code";`)
}
