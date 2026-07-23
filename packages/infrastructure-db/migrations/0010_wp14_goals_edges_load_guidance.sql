CREATE TABLE "edge_type_registry" (
	"key" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"semantics_version" integer DEFAULT 1 NOT NULL,
	"symmetric" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edge_type_registry_key_valid" CHECK ("edge_type_registry"."key" ~ '^[a-z][a-z0-9_]{2,63}$'),
	CONSTRAINT "edge_type_registry_semantics_version_positive" CHECK ("edge_type_registry"."semantics_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "edges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"source_resource_id" uuid NOT NULL,
	"target_resource_id" uuid NOT NULL,
	"edge_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "edges_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "edges_distinct_resources" CHECK ("edges"."source_resource_id" <> "edges"."target_resource_id"),
	CONSTRAINT "edges_removed_valid" CHECK ("edges"."removed_at" is null or "edges"."removed_at" >= "edges"."created_at"),
	CONSTRAINT "edges_version_positive" CHECK ("edges"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"narrative" text DEFAULT '' NOT NULL,
	"type" text NOT NULL,
	"success_criteria" text DEFAULT '' NOT NULL,
	"target_date" date,
	"life_domain" text NOT NULL,
	"state" text DEFAULT 'incubating' NOT NULL,
	"creation_authority" text DEFAULT 'manual' NOT NULL,
	"source_proposal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "goals_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "goals_title_valid" CHECK (length(btrim("goals"."title")) between 1 and 240),
	CONSTRAINT "goals_narrative_valid" CHECK (length("goals"."narrative") <= 4000),
	CONSTRAINT "goals_success_criteria_valid" CHECK (length("goals"."success_criteria") <= 2000),
	CONSTRAINT "goals_life_domain_valid" CHECK (length(btrim("goals"."life_domain")) between 1 and 100),
	CONSTRAINT "goals_type_valid" CHECK ("goals"."type" in ('outcome', 'behavioural')),
	CONSTRAINT "goals_state_valid" CHECK ("goals"."state" in ('incubating', 'active', 'paused', 'completed', 'retired', 'merged')),
	CONSTRAINT "goals_creation_authority_valid" CHECK ("goals"."creation_authority" in ('manual', 'accepted_proposal')),
	CONSTRAINT "goals_source_authority_valid" CHECK (("goals"."creation_authority" = 'manual' and "goals"."source_proposal_id" is null) or ("goals"."creation_authority" = 'accepted_proposal' and "goals"."source_proposal_id" is not null)),
	CONSTRAINT "goals_version_positive" CHECK ("goals"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_edge_type_edge_type_registry_key_fk" FOREIGN KEY ("edge_type") REFERENCES "public"."edge_type_registry"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_source_owner_fk" FOREIGN KEY ("source_resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_target_owner_fk" FOREIGN KEY ("target_resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_resource_owner_fk" FOREIGN KEY ("id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_source_proposal_owner_fk" FOREIGN KEY ("source_proposal_id","user_id") REFERENCES "public"."proposals"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "edges_active_relation_unique" ON "edges" USING btree ("user_id","source_resource_id","target_resource_id","edge_type") WHERE "edges"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "edges_user_source_idx" ON "edges" USING btree ("user_id","source_resource_id","removed_at");--> statement-breakpoint
CREATE INDEX "edges_user_target_idx" ON "edges" USING btree ("user_id","target_resource_id","removed_at");--> statement-breakpoint
CREATE INDEX "goals_user_state_updated_idx" ON "goals" USING btree ("user_id","state","updated_at");--> statement-breakpoint
CREATE INDEX "goals_user_target_date_idx" ON "goals" USING btree ("user_id","target_date");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_soft_active_goal_limit_valid" CHECK ("users"."soft_active_goal_limit" between 1 and 20);
--> statement-breakpoint
INSERT INTO schema_registry (key, version, status, json_schema)
VALUES
  (
    'resource.goal',
    1,
    'active',
    '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false}'::jsonb
  )
ON CONFLICT (key, version) DO NOTHING;
--> statement-breakpoint
INSERT INTO edge_type_registry (key, description, semantics_version, "symmetric")
VALUES
  ('part_of', 'Source is a component of target.', 1, false),
  ('depends_on', 'Source requires target before it can proceed.', 1, false),
  ('blocks', 'Source prevents target from proceeding.', 1, false),
  ('conflicts_with', 'Source and target are in explicit tension.', 1, true),
  ('supports', 'Source contributes to target.', 1, false),
  ('merged_into', 'Source goal was terminally merged into target goal.', 1, false)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goals" FORCE ROW LEVEL SECURITY;
CREATE POLICY "goals_owner_scope" ON "goals"
  USING ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "edges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "edges" FORCE ROW LEVEL SECURITY;
CREATE POLICY "edges_owner_scope" ON "edges"
  USING ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid);
