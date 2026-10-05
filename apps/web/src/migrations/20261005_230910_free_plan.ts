import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_restaurants_plan" AS ENUM('free', 'menu', 'pedidos', 'salon');
  ALTER TABLE "restaurants" ADD COLUMN "plan" "enum_restaurants_plan" DEFAULT 'free';
  ALTER TABLE "restaurants" ADD COLUMN "publish_approved" boolean DEFAULT false;
  ALTER TABLE "restaurants" ADD COLUMN "terms_version" varchar;
  ALTER TABLE "restaurants" ADD COLUMN "terms_accepted_at" timestamp(3) with time zone;
  ALTER TABLE "restaurants" ADD COLUMN "terms_how" varchar;
  ALTER TABLE "restaurants" ADD COLUMN "publish_day" varchar;
  ALTER TABLE "restaurants" ADD COLUMN "publish_count" numeric;
  -- restaurants that exist today are pilots: no plan (no limits) and already approved to publish
  UPDATE "restaurants" SET "plan" = NULL, "publish_approved" = true;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "restaurants" DROP COLUMN "plan";
  ALTER TABLE "restaurants" DROP COLUMN "publish_approved";
  ALTER TABLE "restaurants" DROP COLUMN "terms_version";
  ALTER TABLE "restaurants" DROP COLUMN "terms_accepted_at";
  ALTER TABLE "restaurants" DROP COLUMN "terms_how";
  ALTER TABLE "restaurants" DROP COLUMN "publish_day";
  ALTER TABLE "restaurants" DROP COLUMN "publish_count";
  DROP TYPE "public"."enum_restaurants_plan";`)
}
