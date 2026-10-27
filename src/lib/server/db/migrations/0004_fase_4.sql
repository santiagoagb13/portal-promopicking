ALTER TABLE "kit_events" ADD COLUMN "client_event_id" text;--> statement-breakpoint
ALTER TABLE "kit_events" ADD COLUMN "recorded_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "kit_events" ADD COLUMN "detail" jsonb;--> statement-breakpoint
ALTER TABLE "kit_events" ADD CONSTRAINT "kit_events_client_event_id_unique" UNIQUE("client_event_id");