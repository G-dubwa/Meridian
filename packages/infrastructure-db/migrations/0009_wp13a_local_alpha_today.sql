CREATE TABLE "agenda_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"time_zone" text NOT NULL,
	"state" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "agenda_blocks_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "agenda_blocks_title_valid" CHECK (length(btrim("agenda_blocks"."title")) between 1 and 240),
	CONSTRAINT "agenda_blocks_notes_valid" CHECK (length("agenda_blocks"."notes") <= 2000),
	CONSTRAINT "agenda_blocks_time_zone_valid" CHECK (length("agenda_blocks"."time_zone") between 1 and 100),
	CONSTRAINT "agenda_blocks_order_valid" CHECK ("agenda_blocks"."ends_at" > "agenda_blocks"."starts_at"),
	CONSTRAINT "agenda_blocks_duration_valid" CHECK ("agenda_blocks"."ends_at" <= "agenda_blocks"."starts_at" + interval '24 hours'),
	CONSTRAINT "agenda_blocks_state_valid" CHECK ("agenda_blocks"."state" in ('planned', 'completed', 'cancelled')),
	CONSTRAINT "agenda_blocks_version_positive" CHECK ("agenda_blocks"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "daily_priorities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "daily_priorities_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "daily_priorities_task_date_unique" UNIQUE("user_id","task_id","local_date"),
	CONSTRAINT "daily_priorities_position_unique" UNIQUE("user_id","local_date","position"),
	CONSTRAINT "daily_priorities_position_valid" CHECK ("daily_priorities"."position" between 1 and 3),
	CONSTRAINT "daily_priorities_version_positive" CHECK ("daily_priorities"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "today_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"target_resource_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"action" text NOT NULL,
	"prior_state" text,
	"resulting_version" integer NOT NULL,
	"effect_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "today_receipts_target_valid" CHECK ("today_receipts"."target_type" in ('task', 'reminder', 'agenda_block', 'priority')),
	CONSTRAINT "today_receipts_action_valid" CHECK ("today_receipts"."action" in ('task_completed', 'reminder_completed', 'reminder_dismissed', 'agenda_completed', 'agenda_cancelled', 'priority_selected')),
	CONSTRAINT "today_receipts_status_valid" CHECK ("today_receipts"."status" in ('active', 'undone')),
	CONSTRAINT "today_receipts_undone_valid" CHECK (("today_receipts"."status" = 'active' and "today_receipts"."undone_at" is null) or ("today_receipts"."status" = 'undone' and "today_receipts"."undone_at" is not null)),
	CONSTRAINT "today_receipts_priority_effect_valid" CHECK (("today_receipts"."target_type" = 'priority' and "today_receipts"."effect_id" is not null and "today_receipts"."prior_state" is null) or ("today_receipts"."target_type" <> 'priority' and "today_receipts"."effect_id" is null and "today_receipts"."prior_state" is not null)),
	CONSTRAINT "today_receipts_result_version_positive" CHECK ("today_receipts"."resulting_version" > 0),
	CONSTRAINT "today_receipts_version_positive" CHECK ("today_receipts"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "agenda_blocks" ADD CONSTRAINT "agenda_blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_blocks" ADD CONSTRAINT "agenda_blocks_resource_owner_fk" FOREIGN KEY ("id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_priorities" ADD CONSTRAINT "daily_priorities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_priorities" ADD CONSTRAINT "daily_priorities_task_owner_fk" FOREIGN KEY ("task_id","user_id") REFERENCES "public"."tasks"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "today_receipts" ADD CONSTRAINT "today_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "today_receipts" ADD CONSTRAINT "today_receipts_target_owner_fk" FOREIGN KEY ("target_resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_blocks_user_window_idx" ON "agenda_blocks" USING btree ("user_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "daily_priorities_user_date_idx" ON "daily_priorities" USING btree ("user_id","local_date","position");--> statement-breakpoint
CREATE INDEX "today_receipts_user_created_idx" ON "today_receipts" USING btree ("user_id","created_at");
--> statement-breakpoint
INSERT INTO schema_registry (key, version, status, json_schema)
VALUES
  (
    'resource.agenda_block',
    1,
    'active',
    '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false}'::jsonb
  )
ON CONFLICT (key, version) DO NOTHING;
--> statement-breakpoint
ALTER TABLE "agenda_blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agenda_blocks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "agenda_blocks_owner_scope" ON "agenda_blocks"
  USING ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "daily_priorities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_priorities" FORCE ROW LEVEL SECURITY;
CREATE POLICY "daily_priorities_owner_scope" ON "daily_priorities"
  USING ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "today_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "today_receipts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "today_receipts_owner_scope" ON "today_receipts"
  USING ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid);
