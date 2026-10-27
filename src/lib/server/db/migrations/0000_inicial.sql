CREATE TYPE "public"."catalog_category" AS ENUM('generic', 'lsm');--> statement-breakpoint
CREATE TYPE "public"."event_source" AS ENUM('web', 'scanner', 'mobile', 'qr');--> statement-breakpoint
CREATE TYPE "public"."kit_event_type" AS ENUM('prepared', 'shipped', 'hub_in', 'out_for_delivery', 'received', 'incident');--> statement-breakpoint
CREATE TYPE "public"."milestone_key" AS ENUM('brief', 'af', 'aprob', 'prod_ini', 'prod_fin', 'kitting', 'exped', 'plataforma', 'rte');--> statement-breakpoint
CREATE TYPE "public"."order_source" AS ENUM('web', 'qr');--> statement-breakpoint
CREATE TYPE "public"."order_state" AS ENUM('pending_validation', 'preparing', 'shipping', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'ops', 'production', 'brand', 'manager');--> statement-breakpoint
CREATE TYPE "public"."ticket_severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."ticket_state" AS ENUM('open', 'in_progress', 'answered', 'closed');--> statement-breakpoint
CREATE TYPE "public"."ticket_type" AS ENUM('incident', 'query');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."version_status" AS ENUM('pending', 'approved', 'changes');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short" text NOT NULL,
	"restaurant_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_milestones" (
	"campaign_id" text NOT NULL,
	"key" "milestone_key" NOT NULL,
	"due_on" date NOT NULL,
	"done_at" timestamp with time zone,
	CONSTRAINT "campaign_milestones_campaign_id_key_pk" PRIMARY KEY("campaign_id","key")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_code" text NOT NULL,
	"name" text NOT NULL,
	"in_restaurant_on" date NOT NULL,
	"restaurant_count" integer NOT NULL,
	"owner_user_id" text,
	"planned" boolean DEFAULT false NOT NULL,
	"materials" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" text PRIMARY KEY NOT NULL,
	"category" "catalog_category" NOT NULL,
	"brand_code" text,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"unit" text NOT NULL,
	"price_cents" integer NOT NULL,
	"lead_days" smallint NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "role" NOT NULL,
	"scope" jsonb NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_user_id" text,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "kit_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "kit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kit_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"type" "kit_event_type" NOT NULL,
	"by_user_id" text,
	"by_label" text,
	"source" "event_source" DEFAULT 'web' NOT NULL,
	"photo_key" text
);
--> statement-breakpoint
CREATE TABLE "kit_lines" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "kit_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kit_id" text NOT NULL,
	"support_id" text,
	"label" text NOT NULL,
	"version_code" text NOT NULL,
	"qty" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kits" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"restaurant_id" text NOT NULL,
	"parcels" smallint DEFAULT 1 NOT NULL,
	"state" smallint DEFAULT 0 NOT NULL,
	"incident_ticket_id" text,
	"received_by" text,
	"received_at" timestamp with time zone,
	CONSTRAINT "kits_campaign_restaurant_uq" UNIQUE("campaign_id","restaurant_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"order_id" text NOT NULL,
	"item_id" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	CONSTRAINT "order_lines_order_id_item_id_pk" PRIMARY KEY("order_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"placed_by" text,
	"placed_at" timestamp with time zone NOT NULL,
	"state" "order_state" NOT NULL,
	"source" "order_source" DEFAULT 'web' NOT NULL,
	"validated_by" text
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"aaguid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "passkeys_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "qr_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"support_id" text NOT NULL,
	"version_code" text NOT NULL,
	"batch" text NOT NULL,
	"printed_at" timestamp with time zone,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_code" text NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"address" text NOT NULL,
	"tariff" text NOT NULL,
	"language" text NOT NULL,
	"assortment" text NOT NULL,
	"facade" text,
	"delivery_point" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "support_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"support_id" text NOT NULL,
	"code" text NOT NULL,
	"tariff" text,
	"assortment" text,
	"language" text,
	"variant" text,
	"kits_count" integer,
	"status" "version_status" DEFAULT 'pending' NOT NULL,
	"revision" smallint DEFAULT 1 NOT NULL,
	"file_key" text,
	"file_size" integer,
	"page_images" jsonb,
	"uploaded_by" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"prev_version_id" text,
	CONSTRAINT "support_versions_code_rev_uq" UNIQUE("support_id","code","revision")
);
--> statement-breakpoint
CREATE TABLE "supports" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"versions_planned" integer DEFAULT 0 NOT NULL,
	"run_qty" integer DEFAULT 0 NOT NULL,
	"per_kit_qty" integer,
	"packaging" text,
	"stage" smallint DEFAULT 0 NOT NULL,
	"responsible" text,
	"notes" text,
	"artwork_format" text,
	"artwork_label" text,
	"artwork_prev_label" text
);
--> statement-breakpoint
CREATE TABLE "ticket_updates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ticket_updates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ticket_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"user_id" text,
	"author_label" text,
	"text" text NOT NULL,
	"photo_key" text
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text,
	"restaurant_id" text,
	"type" "ticket_type" NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"severity" "ticket_severity" DEFAULT 'medium' NOT NULL,
	"state" "ticket_state" DEFAULT 'open' NOT NULL,
	"opened_by" text,
	"opened_by_label" text,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_brands" (
	"user_id" text NOT NULL,
	"brand_code" text NOT NULL,
	CONSTRAINT "user_brands_user_id_brand_code_pk" PRIMARY KEY("user_id","brand_code")
);
--> statement-breakpoint
CREATE TABLE "user_restaurants" (
	"user_id" text NOT NULL,
	"restaurant_id" text NOT NULL,
	CONSTRAINT "user_restaurants_user_id_restaurant_id_pk" PRIMARY KEY("user_id","restaurant_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "role" NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"organization" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "version_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"version_id" text NOT NULL,
	"user_id" text,
	"author_label" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"text" text NOT NULL,
	"page" smallint,
	"x" real,
	"y" real
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_milestones" ADD CONSTRAINT "campaign_milestones_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_brand_code_brands_code_fk" FOREIGN KEY ("brand_code") REFERENCES "public"."brands"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_brand_code_brands_code_fk" FOREIGN KEY ("brand_code") REFERENCES "public"."brands"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_used_by_user_id_users_id_fk" FOREIGN KEY ("used_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_events" ADD CONSTRAINT "kit_events_kit_id_kits_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."kits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_events" ADD CONSTRAINT "kit_events_by_user_id_users_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_lines" ADD CONSTRAINT "kit_lines_kit_id_kits_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."kits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_lines" ADD CONSTRAINT "kit_lines_support_id_supports_id_fk" FOREIGN KEY ("support_id") REFERENCES "public"."supports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kits" ADD CONSTRAINT "kits_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kits" ADD CONSTRAINT "kits_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kits" ADD CONSTRAINT "kits_incident_ticket_id_tickets_id_fk" FOREIGN KEY ("incident_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_placed_by_users_id_fk" FOREIGN KEY ("placed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_support_id_supports_id_fk" FOREIGN KEY ("support_id") REFERENCES "public"."supports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_brand_code_brands_code_fk" FOREIGN KEY ("brand_code") REFERENCES "public"."brands"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_versions" ADD CONSTRAINT "support_versions_support_id_supports_id_fk" FOREIGN KEY ("support_id") REFERENCES "public"."supports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_versions" ADD CONSTRAINT "support_versions_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_versions" ADD CONSTRAINT "support_versions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supports" ADD CONSTRAINT "supports_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_updates" ADD CONSTRAINT "ticket_updates_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_updates" ADD CONSTRAINT "ticket_updates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_brands" ADD CONSTRAINT "user_brands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_brands" ADD CONSTRAINT "user_brands_brand_code_brands_code_fk" FOREIGN KEY ("brand_code") REFERENCES "public"."brands"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_restaurants" ADD CONSTRAINT "user_restaurants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_restaurants" ADD CONSTRAINT "user_restaurants_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_comments" ADD CONSTRAINT "version_comments_version_id_support_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."support_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_comments" ADD CONSTRAINT "version_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_user_at_idx" ON "audit_log" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "campaigns_brand_date_idx" ON "campaigns" USING btree ("brand_code","in_restaurant_on");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "kit_events_kit_idx" ON "kit_events" USING btree ("kit_id","at");--> statement-breakpoint
CREATE INDEX "kit_lines_kit_idx" ON "kit_lines" USING btree ("kit_id");--> statement-breakpoint
CREATE INDEX "kits_campaign_state_idx" ON "kits" USING btree ("campaign_id","state");--> statement-breakpoint
CREATE INDEX "kits_restaurant_idx" ON "kits" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","created_at") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX "orders_restaurant_idx" ON "orders" USING btree ("restaurant_id","placed_at");--> statement-breakpoint
CREATE INDEX "passkeys_user_idx" ON "passkeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "restaurants_brand_idx" ON "restaurants" USING btree ("brand_code");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "support_versions_support_status_idx" ON "support_versions" USING btree ("support_id","status");--> statement-breakpoint
CREATE INDEX "supports_campaign_idx" ON "supports" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "ticket_updates_ticket_idx" ON "ticket_updates" USING btree ("ticket_id","at");--> statement-breakpoint
CREATE INDEX "tickets_state_opened_idx" ON "tickets" USING btree ("state","opened_at");--> statement-breakpoint
CREATE INDEX "tickets_campaign_idx" ON "tickets" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "version_comments_version_idx" ON "version_comments" USING btree ("version_id");