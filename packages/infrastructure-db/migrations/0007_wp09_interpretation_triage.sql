CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"source_revision_id" uuid NOT NULL,
	"source_span_start" integer NOT NULL,
	"source_span_end" integer NOT NULL,
	"proposal_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"authority_class" text NOT NULL,
	"assertion_class" text NOT NULL,
	"confidence" numeric(6, 5) NOT NULL,
	"uncertainty_indicators" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"suppression_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "proposals_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "proposals_type_valid" CHECK ("proposals"."proposal_type" in ('task', 'reminder', 'commitment', 'goal', 'memory')),
	CONSTRAINT "proposals_authority_valid" CHECK ("proposals"."authority_class" in ('ambiguous_command', 'inferred_structure', 'durable_claim', 'external_action_preview')),
	CONSTRAINT "proposals_assertion_valid" CHECK ("proposals"."assertion_class" in ('explicit_statement', 'strong_interpretation', 'weak_inference', 'hypothesis')),
	CONSTRAINT "proposals_status_valid" CHECK ("proposals"."status" in ('pending', 'accepted', 'edited_accepted', 'dismissed', 'stale', 'expired')),
	CONSTRAINT "proposals_span_valid" CHECK ("proposals"."source_span_end" > "proposals"."source_span_start"),
	CONSTRAINT "proposals_span_start_nonnegative" CHECK ("proposals"."source_span_start" >= 0),
	CONSTRAINT "proposals_confidence_valid" CHECK ("proposals"."confidence" between 0 and 1),
	CONSTRAINT "proposals_dedupe_length" CHECK (length("proposals"."dedupe_key") = 64),
	CONSTRAINT "proposals_version_positive" CHECK ("proposals"."version" > 0),
	CONSTRAINT "proposals_payload_object" CHECK (jsonb_typeof("proposals"."payload") = 'object'),
	CONSTRAINT "proposals_uncertainty_array" CHECK (jsonb_typeof("proposals"."uncertainty_indicators") = 'array')
);
--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_resource_owner_fk" FOREIGN KEY ("id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_source_revision_owner_fk" FOREIGN KEY ("source_revision_id","user_id") REFERENCES "public"."entry_revisions"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proposals_user_pending_idx" ON "proposals" USING btree ("user_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "proposals_user_dedupe_idx" ON "proposals" USING btree ("user_id","dedupe_key","created_at");
--> statement-breakpoint
INSERT INTO schema_registry (key, version, status, json_schema)
VALUES (
  'resource.proposal',
  1,
  'active',
  '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false}'::jsonb
)
ON CONFLICT (key, version) DO NOTHING;
--> statement-breakpoint
ALTER TABLE "proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "proposals" FORCE ROW LEVEL SECURITY;
CREATE POLICY "proposals_owner_scope" ON "proposals"
  USING ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid);
