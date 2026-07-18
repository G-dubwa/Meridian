CREATE TABLE "derivation_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"derived_resource_id" uuid NOT NULL,
	"source_resource_id" uuid,
	"source_revision_id" uuid,
	"source_span_start" integer,
	"source_span_end" integer,
	"relation" text NOT NULL,
	"assertion_class" text NOT NULL,
	"confidence" numeric(6, 5),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invalidated_at" timestamp with time zone,
	"invalidation_reason" text,
	CONSTRAINT "derivation_links_has_source" CHECK ("derivation_links"."source_resource_id" is not null or "derivation_links"."source_revision_id" is not null),
	CONSTRAINT "derivation_links_span_valid" CHECK (("derivation_links"."source_span_start" is null and "derivation_links"."source_span_end" is null) or ("derivation_links"."source_span_start" >= 0 and "derivation_links"."source_span_end" > "derivation_links"."source_span_start")),
	CONSTRAINT "derivation_links_relation_valid" CHECK ("derivation_links"."relation" in ('supports', 'contradicts', 'supersedes', 'derived_from', 'measures', 'summarises')),
	CONSTRAINT "derivation_links_confidence_valid" CHECK ("derivation_links"."confidence" is null or ("derivation_links"."confidence" >= 0 and "derivation_links"."confidence" <= 1))
);
--> statement-breakpoint
CREATE TABLE "domain_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"payload_schema_version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"aggregate_id" uuid,
	"correlation_id" uuid NOT NULL,
	"causation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_events_id_user_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"current_revision_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"sensitivity" text DEFAULT 'normal' NOT NULL,
	"attrs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attrs_schema_key" text DEFAULT 'attrs.entry' NOT NULL,
	"attrs_schema_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "entries_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "entries_version_positive" CHECK ("entries"."version" > 0),
	CONSTRAINT "entries_attrs_object" CHECK (jsonb_typeof("entries"."attrs") = 'object'),
	CONSTRAINT "entries_status_valid" CHECK ("entries"."status" in ('active', 'deleted')),
	CONSTRAINT "entries_sensitivity_valid" CHECK ("entries"."sensitivity" in ('normal', 'sensitive', 'private'))
);
--> statement-breakpoint
CREATE TABLE "entry_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"body_markdown" text NOT NULL,
	"body_raw" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"processing_class" text NOT NULL,
	"change_kind" text NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "entry_revisions_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "entry_revisions_number_positive" CHECK ("entry_revisions"."revision_number" > 0),
	CONSTRAINT "entry_revisions_processing_class_valid" CHECK ("entry_revisions"."processing_class" in ('standard', 'sensitive', 'private')),
	CONSTRAINT "entry_revisions_change_kind_valid" CHECK ("entry_revisions"."change_kind" in ('content', 'privacy', 'redaction', 'metadata')),
	CONSTRAINT "entry_revisions_created_by_valid" CHECK ("entry_revisions"."created_by" in ('user', 'system'))
);
--> statement-breakpoint
CREATE TABLE "outbox_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"domain_event_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "outbox_messages_attempts_nonnegative" CHECK ("outbox_messages"."attempts" >= 0),
	CONSTRAINT "outbox_messages_status_valid" CHECK ("outbox_messages"."status" in ('pending', 'in_flight', 'succeeded', 'failed', 'uncertain'))
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"resource_type_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "resources_id_user_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "schema_registry" (
	"key" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"json_schema" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schema_registry_key_version_pk" PRIMARY KEY("key","version"),
	CONSTRAINT "schema_registry_version_positive" CHECK ("schema_registry"."version" > 0),
	CONSTRAINT "schema_registry_schema_object" CHECK (jsonb_typeof("schema_registry"."json_schema") = 'object')
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"locale" text DEFAULT 'en-ZA' NOT NULL,
	"home_time_zone" text NOT NULL,
	"soft_active_goal_limit" integer DEFAULT 5 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "derivation_links" ADD CONSTRAINT "derivation_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivation_links" ADD CONSTRAINT "derivation_links_derived_owner_fk" FOREIGN KEY ("derived_resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivation_links" ADD CONSTRAINT "derivation_links_source_resource_owner_fk" FOREIGN KEY ("source_resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivation_links" ADD CONSTRAINT "derivation_links_source_revision_owner_fk" FOREIGN KEY ("source_revision_id","user_id") REFERENCES "public"."entry_revisions"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_resource_owner_fk" FOREIGN KEY ("id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_attrs_schema_fk" FOREIGN KEY ("attrs_schema_key","attrs_schema_version") REFERENCES "public"."schema_registry"("key","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_revisions" ADD CONSTRAINT "entry_revisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_revisions" ADD CONSTRAINT "entry_revisions_entry_owner_fk" FOREIGN KEY ("entry_id","user_id") REFERENCES "public"."entries"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_event_owner_fk" FOREIGN KEY ("domain_event_id","user_id") REFERENCES "public"."domain_events"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_registered_type_fk" FOREIGN KEY ("resource_type","resource_type_version") REFERENCES "public"."schema_registry"("key","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "derivation_links_derived_idx" ON "derivation_links" USING btree ("user_id","derived_resource_id");--> statement-breakpoint
CREATE INDEX "derivation_links_source_revision_idx" ON "derivation_links" USING btree ("user_id","source_revision_id");--> statement-breakpoint
CREATE INDEX "domain_events_user_occurred_idx" ON "domain_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "domain_events_correlation_idx" ON "domain_events" USING btree ("user_id","correlation_id");--> statement-breakpoint
CREATE INDEX "entries_user_updated_idx" ON "entries" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "entry_revisions_entry_number_unique" ON "entry_revisions" USING btree ("entry_id","revision_number");--> statement-breakpoint
CREATE INDEX "entry_revisions_user_created_idx" ON "entry_revisions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_messages_event_unique" ON "outbox_messages" USING btree ("domain_event_id");--> statement-breakpoint
CREATE INDEX "outbox_messages_claim_idx" ON "outbox_messages" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "outbox_messages_user_created_idx" ON "outbox_messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "resources_user_type_idx" ON "resources" USING btree ("user_id","resource_type");--> statement-breakpoint
CREATE INDEX "resources_user_created_idx" ON "resources" USING btree ("user_id","created_at");