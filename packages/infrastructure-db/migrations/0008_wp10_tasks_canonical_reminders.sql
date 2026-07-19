CREATE TABLE "command_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"target_resource_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "command_receipts_target_valid" CHECK ("command_receipts"."target_type" in ('task', 'reminder')),
	CONSTRAINT "command_receipts_status_valid" CHECK ("command_receipts"."status" in ('active', 'undone')),
	CONSTRAINT "command_receipts_undone_valid" CHECK (("command_receipts"."status" = 'active' and "command_receipts"."undone_at" is null) or ("command_receipts"."status" = 'undone' and "command_receipts"."undone_at" is not null)),
	CONSTRAINT "command_receipts_version_positive" CHECK ("command_receipts"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "reminder_occurrences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"reminder_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_occurrences_schedule_unique" UNIQUE("reminder_id","scheduled_for"),
	CONSTRAINT "reminder_occurrences_state_valid" CHECK ("reminder_occurrences"."state" in ('pending', 'due', 'acknowledged', 'dismissed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"related_resource_id" uuid,
	"purpose" text NOT NULL,
	"trigger_at" timestamp with time zone NOT NULL,
	"time_zone" text NOT NULL,
	"recurrence" jsonb,
	"delivery_policy" text DEFAULT 'undecided' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"quiet_hours_behavior" text DEFAULT 'defer' NOT NULL,
	"expires_at" timestamp with time zone,
	"state" text DEFAULT 'scheduled' NOT NULL,
	"creation_authority" text NOT NULL,
	"source_proposal_id" uuid,
	"owner_feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "reminders_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "reminders_purpose_valid" CHECK (length(btrim("reminders"."purpose")) between 1 and 500),
	CONSTRAINT "reminders_time_zone_valid" CHECK (length("reminders"."time_zone") between 1 and 100),
	CONSTRAINT "reminders_recurrence_object" CHECK ("reminders"."recurrence" is null or jsonb_typeof("reminders"."recurrence") = 'object'),
	CONSTRAINT "reminders_delivery_policy_valid" CHECK ("reminders"."delivery_policy" = 'undecided'),
	CONSTRAINT "reminders_priority_valid" CHECK ("reminders"."priority" in ('low', 'normal', 'high')),
	CONSTRAINT "reminders_quiet_hours_valid" CHECK ("reminders"."quiet_hours_behavior" = 'defer'),
	CONSTRAINT "reminders_expiry_valid" CHECK ("reminders"."expires_at" is null or "reminders"."expires_at" > "reminders"."trigger_at"),
	CONSTRAINT "reminders_state_valid" CHECK ("reminders"."state" in ('scheduled', 'due', 'delivered', 'completed', 'dismissed', 'snoozed', 'paused', 'expired')),
	CONSTRAINT "reminders_creation_authority_valid" CHECK ("reminders"."creation_authority" in ('manual', 'explicit_command', 'accepted_proposal')),
	CONSTRAINT "reminders_feedback_valid" CHECK ("reminders"."owner_feedback" is null or length("reminders"."owner_feedback") <= 1000),
	CONSTRAINT "reminders_version_positive" CHECK ("reminders"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_resource_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"estimate_minutes" integer,
	"due_at" timestamp with time zone,
	"state" text DEFAULT 'open' NOT NULL,
	"creation_authority" text NOT NULL,
	"source_proposal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "tasks_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "tasks_kind_valid" CHECK ("tasks"."kind" in ('task', 'commitment', 'routine', 'milestone')),
	CONSTRAINT "tasks_state_valid" CHECK ("tasks"."state" in ('open', 'scheduled', 'done', 'dropped', 'superseded')),
	CONSTRAINT "tasks_creation_authority_valid" CHECK ("tasks"."creation_authority" in ('manual', 'explicit_command', 'accepted_proposal')),
	CONSTRAINT "tasks_estimate_valid" CHECK ("tasks"."estimate_minutes" is null or ("tasks"."estimate_minutes" between 1 and 10080)),
	CONSTRAINT "tasks_title_valid" CHECK (length(btrim("tasks"."title")) between 1 and 240),
	CONSTRAINT "tasks_notes_valid" CHECK (length("tasks"."notes") <= 2000),
	CONSTRAINT "tasks_version_positive" CHECK ("tasks"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "command_receipts" ADD CONSTRAINT "command_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command_receipts" ADD CONSTRAINT "command_receipts_target_owner_fk" FOREIGN KEY ("target_resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_occurrences" ADD CONSTRAINT "reminder_occurrences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_occurrences" ADD CONSTRAINT "reminder_occurrences_reminder_owner_fk" FOREIGN KEY ("reminder_id","user_id") REFERENCES "public"."reminders"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_resource_owner_fk" FOREIGN KEY ("id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_related_owner_fk" FOREIGN KEY ("related_resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_proposal_owner_fk" FOREIGN KEY ("source_proposal_id","user_id") REFERENCES "public"."proposals"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_resource_owner_fk" FOREIGN KEY ("id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_goal_owner_fk" FOREIGN KEY ("goal_resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_proposal_owner_fk" FOREIGN KEY ("source_proposal_id","user_id") REFERENCES "public"."proposals"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "command_receipts_user_created_idx" ON "command_receipts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "reminder_occurrences_user_due_idx" ON "reminder_occurrences" USING btree ("user_id","state","scheduled_for");--> statement-breakpoint
CREATE INDEX "reminders_user_state_trigger_idx" ON "reminders" USING btree ("user_id","state","trigger_at");--> statement-breakpoint
CREATE INDEX "tasks_user_state_due_idx" ON "tasks" USING btree ("user_id","state","due_at");
--> statement-breakpoint
INSERT INTO schema_registry (key, version, status, json_schema)
VALUES
  (
    'resource.task',
    1,
    'active',
    '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false}'::jsonb
  ),
  (
    'resource.reminder',
    1,
    'active',
    '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false}'::jsonb
  )
ON CONFLICT (key, version) DO NOTHING;
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tasks_owner_scope" ON "tasks"
  USING ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "reminders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reminders" FORCE ROW LEVEL SECURITY;
CREATE POLICY "reminders_owner_scope" ON "reminders"
  USING ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "reminder_occurrences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reminder_occurrences" FORCE ROW LEVEL SECURITY;
CREATE POLICY "reminder_occurrences_owner_scope" ON "reminder_occurrences"
  USING ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "command_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "command_receipts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "command_receipts_owner_scope" ON "command_receipts"
  USING ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid);
