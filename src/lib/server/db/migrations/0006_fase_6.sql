CREATE TABLE "report_history" (
	"month" text NOT NULL,
	"brand_code" text NOT NULL,
	"parcels" integer DEFAULT 0 NOT NULL,
	"parcels_ok" integer DEFAULT 0 NOT NULL,
	"incidents" integer DEFAULT 0 NOT NULL,
	"pieces" integer DEFAULT 0 NOT NULL,
	"orders" integer DEFAULT 0 NOT NULL,
	"order_cents" integer DEFAULT 0 NOT NULL,
	"approvals" integer DEFAULT 0 NOT NULL,
	"approval_days" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "report_history_month_brand_code_pk" PRIMARY KEY("month","brand_code")
);
--> statement-breakpoint
CREATE TABLE "report_history_incidents" (
	"month" text NOT NULL,
	"brand_code" text NOT NULL,
	"kind" text NOT NULL,
	"n" integer NOT NULL,
	CONSTRAINT "report_history_incidents_month_brand_code_kind_pk" PRIMARY KEY("month","brand_code","kind")
);
--> statement-breakpoint
ALTER TABLE "ticket_updates" ADD COLUMN "kind" text DEFAULT 'reply' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "assigned_to" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "order_id" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "report_history" ADD CONSTRAINT "report_history_brand_code_brands_code_fk" FOREIGN KEY ("brand_code") REFERENCES "public"."brands"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_history_incidents" ADD CONSTRAINT "report_history_incidents_brand_code_brands_code_fk" FOREIGN KEY ("brand_code") REFERENCES "public"."brands"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tickets_restaurant_idx" ON "tickets" USING btree ("restaurant_id");