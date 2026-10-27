ALTER TABLE "order_lines" DROP CONSTRAINT "order_lines_order_id_item_id_pk";--> statement-breakpoint
ALTER TABLE "order_lines" ALTER COLUMN "item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "id" integer PRIMARY KEY NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "order_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "support_id" text;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "version_code" text;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "validated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "qr_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD COLUMN "version_id" text;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD COLUMN "restaurant_id" text;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_support_id_supports_id_fk" FOREIGN KEY ("support_id") REFERENCES "public"."supports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_version_id_support_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."support_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_lines_order_idx" ON "order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "qr_codes_support_idx" ON "qr_codes" USING btree ("support_id");--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_version_restaurant_uq" UNIQUE("version_id","restaurant_id");