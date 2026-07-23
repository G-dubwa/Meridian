-- WP-15 provider-independent deterministic local scheduling.
CREATE TABLE "calendar_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"task_id" uuid,
	"goal_id" uuid,
	"ordinal" integer NOT NULL,
	"title" text NOT NULL,
	"planned_effort_minutes" integer NOT NULL,
	"original_starts_at" timestamp with time zone NOT NULL,
	"original_ends_at" timestamp with time zone NOT NULL,
	"current_starts_at" timestamp with time zone NOT NULL,
	"current_ends_at" timestamp with time zone NOT NULL,
	"time_zone" text NOT NULL,
	"state" text DEFAULT 'planned' NOT NULL,
	"approval_recorded_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "calendar_blocks_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "calendar_blocks_proposal_ordinal_unique" UNIQUE("user_id","proposal_id","ordinal"),
	CONSTRAINT "calendar_blocks_title_valid" CHECK (length(btrim("calendar_blocks"."title")) between 1 and 240),
	CONSTRAINT "calendar_blocks_time_valid" CHECK ("calendar_blocks"."original_ends_at" > "calendar_blocks"."original_starts_at" and "calendar_blocks"."current_ends_at" > "calendar_blocks"."current_starts_at"),
	CONSTRAINT "calendar_blocks_effort_valid" CHECK ("calendar_blocks"."planned_effort_minutes" >= 15),
	CONSTRAINT "calendar_blocks_ordinal_valid" CHECK ("calendar_blocks"."ordinal" > 0),
	CONSTRAINT "calendar_blocks_state_valid" CHECK ("calendar_blocks"."state" in ('planned', 'cancelled')),
	CONSTRAINT "calendar_blocks_version_positive" CHECK ("calendar_blocks"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "scheduling_proposals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"task_id" uuid,
	"goal_id" uuid,
	"earliest_start" timestamp with time zone NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"time_zone" text NOT NULL,
	"estimated_effort_minutes" integer NOT NULL,
	"min_block_minutes" integer NOT NULL,
	"max_block_minutes" integer NOT NULL,
	"buffer_minutes" integer NOT NULL,
	"max_deep_work_minutes_per_day" integer NOT NULL,
	"working_windows" jsonb NOT NULL,
	"candidates" jsonb NOT NULL,
	"capacity_minutes" integer NOT NULL,
	"scheduled_minutes" integer NOT NULL,
	"verdict" text NOT NULL,
	"exclusions" jsonb NOT NULL,
	"alternatives" jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "scheduling_proposals_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "scheduling_proposals_target_valid" CHECK ("scheduling_proposals"."task_id" is not null or "scheduling_proposals"."goal_id" is not null),
	CONSTRAINT "scheduling_proposals_horizon_valid" CHECK ("scheduling_proposals"."deadline" > "scheduling_proposals"."earliest_start"),
	CONSTRAINT "scheduling_proposals_title_valid" CHECK (length(btrim("scheduling_proposals"."title")) between 1 and 240),
	CONSTRAINT "scheduling_proposals_constraints_valid" CHECK ("scheduling_proposals"."estimated_effort_minutes" >= 15 and "scheduling_proposals"."min_block_minutes" >= 15 and "scheduling_proposals"."max_block_minutes" >= "scheduling_proposals"."min_block_minutes" and "scheduling_proposals"."buffer_minutes" between 0 and 240 and "scheduling_proposals"."max_deep_work_minutes_per_day" >= "scheduling_proposals"."min_block_minutes"),
	CONSTRAINT "scheduling_proposals_json_valid" CHECK (jsonb_typeof("scheduling_proposals"."working_windows") = 'array' and jsonb_typeof("scheduling_proposals"."candidates") = 'array' and jsonb_typeof("scheduling_proposals"."exclusions") = 'array' and jsonb_typeof("scheduling_proposals"."alternatives") = 'array'),
	CONSTRAINT "scheduling_proposals_capacity_valid" CHECK ("scheduling_proposals"."capacity_minutes" >= 0 and "scheduling_proposals"."scheduled_minutes" >= 0 and "scheduling_proposals"."scheduled_minutes" <= "scheduling_proposals"."estimated_effort_minutes"),
	CONSTRAINT "scheduling_proposals_verdict_valid" CHECK ("scheduling_proposals"."verdict" in ('feasible', 'tight', 'infeasible')),
	CONSTRAINT "scheduling_proposals_state_valid" CHECK ("scheduling_proposals"."state" in ('pending', 'accepted', 'dismissed', 'stale')),
	CONSTRAINT "scheduling_proposals_version_positive" CHECK ("scheduling_proposals"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "calendar_blocks" ADD CONSTRAINT "calendar_blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_blocks" ADD CONSTRAINT "calendar_blocks_resource_owner_fk" FOREIGN KEY ("id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_blocks" ADD CONSTRAINT "calendar_blocks_proposal_owner_fk" FOREIGN KEY ("proposal_id","user_id") REFERENCES "public"."scheduling_proposals"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_blocks" ADD CONSTRAINT "calendar_blocks_task_owner_fk" FOREIGN KEY ("task_id","user_id") REFERENCES "public"."tasks"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_blocks" ADD CONSTRAINT "calendar_blocks_goal_owner_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_proposals" ADD CONSTRAINT "scheduling_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_proposals" ADD CONSTRAINT "scheduling_proposals_task_owner_fk" FOREIGN KEY ("task_id","user_id") REFERENCES "public"."tasks"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_proposals" ADD CONSTRAINT "scheduling_proposals_goal_owner_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_blocks_user_window_idx" ON "calendar_blocks" USING btree ("user_id","current_starts_at","current_ends_at");--> statement-breakpoint
CREATE INDEX "scheduling_proposals_user_state_idx" ON "scheduling_proposals" USING btree ("user_id","state","updated_at");
--> statement-breakpoint
INSERT INTO schema_registry (key, version, status, json_schema)
VALUES
  (
    'resource.calendar_block',
    1,
    'active',
    '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false}'::jsonb
  )
ON CONFLICT (key, version) DO NOTHING;
--> statement-breakpoint
ALTER TABLE "scheduling_proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scheduling_proposals" FORCE ROW LEVEL SECURITY;
CREATE POLICY "scheduling_proposals_owner_scope" ON "scheduling_proposals"
  USING ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "calendar_blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_blocks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "calendar_blocks_owner_scope" ON "calendar_blocks"
  USING ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid);
