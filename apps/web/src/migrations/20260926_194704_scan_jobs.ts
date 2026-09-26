import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_scans_status" AS ENUM('queued', 'processing', 'done', 'failed');
  CREATE TABLE "scans" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"title" varchar,
  	"dish_id" integer,
  	"diameter_cm" numeric,
  	"status" "enum_scans_status",
  	"run_url" varchar,
  	"result" varchar,
  	"error" varchar,
  	"requested_at" timestamp(3) with time zone,
  	"finished_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "scans_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"scan_photos_id" integer
  );
  
  CREATE TABLE "scan_photos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"_key" varchar,
  	"prefix" varchar DEFAULT '',
  	"_objectkey" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "scans_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "scan_photos_id" integer;
  ALTER TABLE "scans" ADD CONSTRAINT "scans_tenant_id_restaurants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."restaurants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "scans" ADD CONSTRAINT "scans_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "scans_rels" ADD CONSTRAINT "scans_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "scans_rels" ADD CONSTRAINT "scans_rels_scan_photos_fk" FOREIGN KEY ("scan_photos_id") REFERENCES "public"."scan_photos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "scan_photos" ADD CONSTRAINT "scan_photos_tenant_id_restaurants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."restaurants"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "scans_tenant_idx" ON "scans" USING btree ("tenant_id");
  CREATE INDEX "scans_dish_idx" ON "scans" USING btree ("dish_id");
  CREATE INDEX "scans_updated_at_idx" ON "scans" USING btree ("updated_at");
  CREATE INDEX "scans_created_at_idx" ON "scans" USING btree ("created_at");
  CREATE INDEX "scans_rels_order_idx" ON "scans_rels" USING btree ("order");
  CREATE INDEX "scans_rels_parent_idx" ON "scans_rels" USING btree ("parent_id");
  CREATE INDEX "scans_rels_path_idx" ON "scans_rels" USING btree ("path");
  CREATE INDEX "scans_rels_scan_photos_id_idx" ON "scans_rels" USING btree ("scan_photos_id");
  CREATE INDEX "scan_photos_tenant_idx" ON "scan_photos" USING btree ("tenant_id");
  CREATE INDEX "scan_photos_updated_at_idx" ON "scan_photos" USING btree ("updated_at");
  CREATE INDEX "scan_photos_created_at_idx" ON "scan_photos" USING btree ("created_at");
  CREATE UNIQUE INDEX "scan_photos_filename_idx" ON "scan_photos" USING btree ("filename");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_scans_fk" FOREIGN KEY ("scans_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_scan_photos_fk" FOREIGN KEY ("scan_photos_id") REFERENCES "public"."scan_photos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_scans_id_idx" ON "payload_locked_documents_rels" USING btree ("scans_id");
  CREATE INDEX "payload_locked_documents_rels_scan_photos_id_idx" ON "payload_locked_documents_rels" USING btree ("scan_photos_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "scans" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "scans_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "scan_photos" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "scans" CASCADE;
  DROP TABLE "scans_rels" CASCADE;
  DROP TABLE "scan_photos" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_scans_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_scan_photos_fk";
  
  DROP INDEX "payload_locked_documents_rels_scans_id_idx";
  DROP INDEX "payload_locked_documents_rels_scan_photos_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "scans_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "scan_photos_id";
  DROP TYPE "public"."enum_scans_status";`)
}
