CREATE TYPE "public"."version_decision" AS ENUM('approved', 'changes', 'reopened', 'undone');--> statement-breakpoint
CREATE TABLE "artwork_upload_items" (
	"id" text PRIMARY KEY NOT NULL,
	"upload_id" text NOT NULL,
	"original_name" text NOT NULL,
	"file_key" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text,
	"detected_code" text,
	"registered_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "artwork_uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"support_id" text NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"discarded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "version_decisions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "version_decisions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"version_id" text NOT NULL,
	"decision" "version_decision" NOT NULL,
	"user_id" text,
	"user_name" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"comment" text,
	"file_hash" text,
	"revision" smallint NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
ALTER TABLE "support_versions" ADD COLUMN "file_hash" text;--> statement-breakpoint
ALTER TABLE "support_versions" ADD COLUMN "original_name" text;--> statement-breakpoint
ALTER TABLE "support_versions" ADD COLUMN "uploaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "support_versions" ADD COLUMN "superseded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "artwork_upload_items" ADD CONSTRAINT "artwork_upload_items_upload_id_artwork_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."artwork_uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artwork_uploads" ADD CONSTRAINT "artwork_uploads_support_id_supports_id_fk" FOREIGN KEY ("support_id") REFERENCES "public"."supports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artwork_uploads" ADD CONSTRAINT "artwork_uploads_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_decisions" ADD CONSTRAINT "version_decisions_version_id_support_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."support_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_decisions" ADD CONSTRAINT "version_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artwork_upload_items_upload_idx" ON "artwork_upload_items" USING btree ("upload_id");--> statement-breakpoint
CREATE INDEX "version_decisions_version_idx" ON "version_decisions" USING btree ("version_id","at");