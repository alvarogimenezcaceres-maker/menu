import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_restaurants_order_types" AS ENUM('delivery', 'pickup');
  CREATE TYPE "public"."enum_restaurants_payment_methods" AS ENUM('efectivo', 'transferencia', 'qr', 'tarjeta');
  CREATE TYPE "public"."enum_restaurants_hours_days" AS ENUM('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');
  CREATE TABLE "restaurants_order_types" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_restaurants_order_types",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "restaurants_payment_methods" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_restaurants_payment_methods",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "restaurants_delivery_zones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"fee" numeric NOT NULL
  );
  
  CREATE TABLE "restaurants_hours_days" (
  	"order" integer NOT NULL,
  	"parent_id" varchar NOT NULL,
  	"value" "enum_restaurants_hours_days",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "restaurants_hours" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"open" varchar NOT NULL,
  	"close" varchar NOT NULL
  );
  
  CREATE TABLE "dishes_options_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"price" numeric DEFAULT 0
  );
  
  ALTER TABLE "restaurants" ADD COLUMN "delivery_fee" numeric;
  ALTER TABLE "restaurants" ADD COLUMN "min_order" numeric;
  ALTER TABLE "restaurants" ADD COLUMN "transfer_info" varchar;
  ALTER TABLE "dishes_options" ADD COLUMN "required" boolean DEFAULT true;
  -- groups created before this field: single choice was always "pick one", multiple was optional
  UPDATE "dishes_options" SET "required" = NOT COALESCE("multiple", false);
  ALTER TABLE "restaurants_order_types" ADD CONSTRAINT "restaurants_order_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "restaurants_payment_methods" ADD CONSTRAINT "restaurants_payment_methods_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "restaurants_delivery_zones" ADD CONSTRAINT "restaurants_delivery_zones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "restaurants_hours_days" ADD CONSTRAINT "restaurants_hours_days_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."restaurants_hours"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "restaurants_hours" ADD CONSTRAINT "restaurants_hours_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "dishes_options_items" ADD CONSTRAINT "dishes_options_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."dishes_options"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "restaurants_order_types_order_idx" ON "restaurants_order_types" USING btree ("order");
  CREATE INDEX "restaurants_order_types_parent_idx" ON "restaurants_order_types" USING btree ("parent_id");
  CREATE INDEX "restaurants_payment_methods_order_idx" ON "restaurants_payment_methods" USING btree ("order");
  CREATE INDEX "restaurants_payment_methods_parent_idx" ON "restaurants_payment_methods" USING btree ("parent_id");
  CREATE INDEX "restaurants_delivery_zones_order_idx" ON "restaurants_delivery_zones" USING btree ("_order");
  CREATE INDEX "restaurants_delivery_zones_parent_id_idx" ON "restaurants_delivery_zones" USING btree ("_parent_id");
  CREATE INDEX "restaurants_hours_days_order_idx" ON "restaurants_hours_days" USING btree ("order");
  CREATE INDEX "restaurants_hours_days_parent_idx" ON "restaurants_hours_days" USING btree ("parent_id");
  CREATE INDEX "restaurants_hours_order_idx" ON "restaurants_hours" USING btree ("_order");
  CREATE INDEX "restaurants_hours_parent_id_idx" ON "restaurants_hours" USING btree ("_parent_id");
  CREATE INDEX "dishes_options_items_order_idx" ON "dishes_options_items" USING btree ("_order");
  CREATE INDEX "dishes_options_items_parent_id_idx" ON "dishes_options_items" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "restaurants_order_types" CASCADE;
  DROP TABLE "restaurants_payment_methods" CASCADE;
  DROP TABLE "restaurants_delivery_zones" CASCADE;
  DROP TABLE "restaurants_hours_days" CASCADE;
  DROP TABLE "restaurants_hours" CASCADE;
  DROP TABLE "dishes_options_items" CASCADE;
  ALTER TABLE "restaurants" DROP COLUMN "delivery_fee";
  ALTER TABLE "restaurants" DROP COLUMN "min_order";
  ALTER TABLE "restaurants" DROP COLUMN "transfer_info";
  ALTER TABLE "dishes_options" DROP COLUMN "required";
  DROP TYPE "public"."enum_restaurants_order_types";
  DROP TYPE "public"."enum_restaurants_payment_methods";
  DROP TYPE "public"."enum_restaurants_hours_days";`)
}
