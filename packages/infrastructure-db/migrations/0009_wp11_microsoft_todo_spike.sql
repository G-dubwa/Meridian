CREATE TABLE "external_write_operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"list_binding_id" uuid,
	"occurrence_id" uuid,
	"correlation_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"ownership_marker" uuid NOT NULL,
	"desired_projection_hash" text,
	"baseline_external_ids" text[] DEFAULT '{}' NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"failure_class" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_write_operations_correlation_unique" UNIQUE("user_id","operation","correlation_id"),
	CONSTRAINT "external_write_operations_kind_valid" CHECK ("external_write_operations"."operation" in ('create_list', 'mark_list', 'create_task', 'update_task', 'delete_task', 'reconcile', 'cleanup')),
	CONSTRAINT "external_write_operations_state_valid" CHECK ("external_write_operations"."state" in ('pending', 'uncertain', 'succeeded', 'failed')),
	CONSTRAINT "external_write_operations_attempts_valid" CHECK ("external_write_operations"."attempt_count" between 0 and 10),
	CONSTRAINT "external_write_operations_projection_hash" CHECK ("external_write_operations"."desired_projection_hash" is null or "external_write_operations"."desired_projection_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "external_write_operations_failure_valid" CHECK ("external_write_operations"."failure_class" is null or "external_write_operations"."failure_class" in ('atomic_extension_unsupported', 'authorization_revoked', 'conflict', 'containment_rejected', 'not_found', 'provider_unavailable', 'rate_limited', 'uncertain_outcome', 'validation_failed'))
);
--> statement-breakpoint
CREATE TABLE "microsoft_todo_list_bindings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"integration_account_id" uuid NOT NULL,
	"external_list_id" text NOT NULL,
	"ownership_marker" uuid NOT NULL,
	"display_name" text DEFAULT 'Meridian' NOT NULL,
	"created_by_meridian" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'experimental' NOT NULL,
	"extension_verified_at" timestamp with time zone NOT NULL,
	"last_verified_at" timestamp with time zone NOT NULL,
	"delta_link_ciphertext" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "microsoft_todo_lists_user_unique" UNIQUE("user_id"),
	CONSTRAINT "microsoft_todo_lists_external_unique" UNIQUE("integration_account_id","external_list_id"),
	CONSTRAINT "microsoft_todo_lists_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "microsoft_todo_lists_name_valid" CHECK ("microsoft_todo_list_bindings"."display_name" = 'Meridian'),
	CONSTRAINT "microsoft_todo_lists_created_by_meridian" CHECK ("microsoft_todo_list_bindings"."created_by_meridian" = true),
	CONSTRAINT "microsoft_todo_lists_status_valid" CHECK ("microsoft_todo_list_bindings"."status" in ('experimental', 'suspended', 'unmanaged', 'cleaned')),
	CONSTRAINT "microsoft_todo_lists_version_positive" CHECK ("microsoft_todo_list_bindings"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "microsoft_todo_task_bindings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"list_binding_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"external_task_id" text NOT NULL,
	"ownership_marker" uuid NOT NULL,
	"projection_hash" text NOT NULL,
	"provider_etag" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "microsoft_todo_tasks_occurrence_unique" UNIQUE("occurrence_id"),
	CONSTRAINT "microsoft_todo_tasks_external_unique" UNIQUE("list_binding_id","external_task_id"),
	CONSTRAINT "microsoft_todo_tasks_projection_hash" CHECK ("microsoft_todo_task_bindings"."projection_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "microsoft_todo_tasks_status_valid" CHECK ("microsoft_todo_task_bindings"."status" in ('pending', 'completed', 'deleted', 'orphaned', 'conflicted', 'unmanaged', 'cleaned')),
	CONSTRAINT "microsoft_todo_tasks_version_positive" CHECK ("microsoft_todo_task_bindings"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "consent_records" RENAME COLUMN "scopes" TO "requested_scopes";--> statement-breakpoint
ALTER TABLE "integration_accounts" RENAME COLUMN "granted_scopes" TO "requested_scopes";--> statement-breakpoint
ALTER TABLE "consent_records" DROP CONSTRAINT "consent_records_stage_a_scopes";--> statement-breakpoint
ALTER TABLE "integration_accounts" DROP CONSTRAINT "integration_accounts_stage_a_scopes";--> statement-breakpoint
ALTER TABLE "oauth_authorization_sessions" DROP CONSTRAINT "oauth_authorization_sessions_stage_a_scopes";--> statement-breakpoint
ALTER TABLE "consent_records" ADD COLUMN "graph_permissions" text[] DEFAULT ARRAY['User.Read', 'Calendars.Read']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_accounts" ADD COLUMN "graph_permissions" text[] DEFAULT ARRAY['User.Read', 'Calendars.Read']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_occurrences" ADD CONSTRAINT "reminder_occurrences_id_user_unique" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "external_write_operations" ADD CONSTRAINT "external_write_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_write_operations" ADD CONSTRAINT "external_write_operations_list_owner_fk" FOREIGN KEY ("list_binding_id","user_id") REFERENCES "public"."microsoft_todo_list_bindings"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_write_operations" ADD CONSTRAINT "external_write_operations_occurrence_owner_fk" FOREIGN KEY ("occurrence_id","user_id") REFERENCES "public"."reminder_occurrences"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microsoft_todo_list_bindings" ADD CONSTRAINT "microsoft_todo_list_bindings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microsoft_todo_list_bindings" ADD CONSTRAINT "microsoft_todo_lists_account_owner_fk" FOREIGN KEY ("integration_account_id","user_id") REFERENCES "public"."integration_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microsoft_todo_task_bindings" ADD CONSTRAINT "microsoft_todo_task_bindings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microsoft_todo_task_bindings" ADD CONSTRAINT "microsoft_todo_tasks_list_owner_fk" FOREIGN KEY ("list_binding_id","user_id") REFERENCES "public"."microsoft_todo_list_bindings"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microsoft_todo_task_bindings" ADD CONSTRAINT "microsoft_todo_tasks_occurrence_owner_fk" FOREIGN KEY ("occurrence_id","user_id") REFERENCES "public"."reminder_occurrences"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "external_write_operations_user_state_idx" ON "external_write_operations" USING btree ("user_id","state","updated_at");--> statement-breakpoint
CREATE INDEX "microsoft_todo_lists_user_status_idx" ON "microsoft_todo_list_bindings" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "microsoft_todo_tasks_user_status_idx" ON "microsoft_todo_task_bindings" USING btree ("user_id","status");--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_approved_scope_envelope" CHECK ((cardinality("consent_records"."requested_scopes") = 5 and "consent_records"."requested_scopes" @> ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read']::text[] and "consent_records"."requested_scopes" <@ ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read']::text[] and cardinality("consent_records"."graph_permissions") = 2 and "consent_records"."graph_permissions" @> ARRAY['User.Read', 'Calendars.Read']::text[] and "consent_records"."graph_permissions" <@ ARRAY['User.Read', 'Calendars.Read']::text[]) or (cardinality("consent_records"."requested_scopes") = 6 and "consent_records"."requested_scopes" @> ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read', 'Tasks.ReadWrite']::text[] and "consent_records"."requested_scopes" <@ ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read', 'Tasks.ReadWrite']::text[] and cardinality("consent_records"."graph_permissions") = 3 and "consent_records"."graph_permissions" @> ARRAY['User.Read', 'Calendars.Read', 'Tasks.ReadWrite']::text[] and "consent_records"."graph_permissions" <@ ARRAY['User.Read', 'Calendars.Read', 'Tasks.ReadWrite']::text[]));--> statement-breakpoint
ALTER TABLE "integration_accounts" ADD CONSTRAINT "integration_accounts_approved_scope_envelope" CHECK ((cardinality("integration_accounts"."requested_scopes") = 5 and "integration_accounts"."requested_scopes" @> ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read']::text[] and "integration_accounts"."requested_scopes" <@ ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read']::text[] and cardinality("integration_accounts"."graph_permissions") = 2 and "integration_accounts"."graph_permissions" @> ARRAY['User.Read', 'Calendars.Read']::text[] and "integration_accounts"."graph_permissions" <@ ARRAY['User.Read', 'Calendars.Read']::text[]) or (cardinality("integration_accounts"."requested_scopes") = 6 and "integration_accounts"."requested_scopes" @> ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read', 'Tasks.ReadWrite']::text[] and "integration_accounts"."requested_scopes" <@ ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read', 'Tasks.ReadWrite']::text[] and cardinality("integration_accounts"."graph_permissions") = 3 and "integration_accounts"."graph_permissions" @> ARRAY['User.Read', 'Calendars.Read', 'Tasks.ReadWrite']::text[] and "integration_accounts"."graph_permissions" <@ ARRAY['User.Read', 'Calendars.Read', 'Tasks.ReadWrite']::text[]));--> statement-breakpoint
ALTER TABLE "oauth_authorization_sessions" ADD CONSTRAINT "oauth_authorization_sessions_approved_scopes" CHECK ((cardinality("oauth_authorization_sessions"."requested_scopes") = 5 and "oauth_authorization_sessions"."requested_scopes" @> ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read']::text[] and "oauth_authorization_sessions"."requested_scopes" <@ ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read']::text[]) or (cardinality("oauth_authorization_sessions"."requested_scopes") = 6 and "oauth_authorization_sessions"."requested_scopes" @> ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read', 'Tasks.ReadWrite']::text[] and "oauth_authorization_sessions"."requested_scopes" <@ ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read', 'Tasks.ReadWrite']::text[]));
--> statement-breakpoint
ALTER TABLE "consent_records" ALTER COLUMN "graph_permissions" DROP DEFAULT;
ALTER TABLE "integration_accounts" ALTER COLUMN "graph_permissions" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "microsoft_todo_list_bindings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "microsoft_todo_list_bindings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "microsoft_todo_list_bindings_owner_scope" ON "microsoft_todo_list_bindings"
  USING ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "microsoft_todo_task_bindings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "microsoft_todo_task_bindings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "microsoft_todo_task_bindings_owner_scope" ON "microsoft_todo_task_bindings"
  USING ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "external_write_operations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "external_write_operations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "external_write_operations_owner_scope" ON "external_write_operations"
  USING ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid);
