CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"source_revision_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"text" text NOT NULL,
	"source_span_start" integer NOT NULL,
	"source_span_end" integer NOT NULL,
	"content_hash" text NOT NULL,
	"locator" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_chunks_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "knowledge_chunks_revision_ordinal_unique" UNIQUE("source_revision_id","ordinal"),
	CONSTRAINT "knowledge_chunks_ordinal_positive" CHECK ("knowledge_chunks"."ordinal" > 0),
	CONSTRAINT "knowledge_chunks_span_valid" CHECK ("knowledge_chunks"."source_span_start" >= 0 and "knowledge_chunks"."source_span_end" > "knowledge_chunks"."source_span_start"),
	CONSTRAINT "knowledge_chunks_hash_length" CHECK (length("knowledge_chunks"."content_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE "knowledge_claim_citations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"source_revision_id" uuid NOT NULL,
	"source_span_start" integer NOT NULL,
	"source_span_end" integer NOT NULL,
	"quoted_text_hash" text NOT NULL,
	"locator" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_claim_citations_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "knowledge_claim_citations_span_valid" CHECK ("knowledge_claim_citations"."source_span_start" >= 0 and "knowledge_claim_citations"."source_span_end" > "knowledge_claim_citations"."source_span_start"),
	CONSTRAINT "knowledge_claim_citations_hash_length" CHECK (length("knowledge_claim_citations"."quoted_text_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE "knowledge_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"knowledge_source_id" uuid NOT NULL,
	"claim_text" text NOT NULL,
	"claim_type" text NOT NULL,
	"epistemic_status" text NOT NULL,
	"population_scope" text,
	"intervention_or_exposure" text,
	"outcome" text,
	"direction" text,
	"effect_expression" text,
	"review_status" text DEFAULT 'candidate' NOT NULL,
	"reviewer_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "knowledge_claims_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "knowledge_claims_text_valid" CHECK (length("knowledge_claims"."claim_text") between 1 and 4000),
	CONSTRAINT "knowledge_claims_type_valid" CHECK ("knowledge_claims"."claim_type" in ('finding', 'mechanism', 'recommendation', 'limitation', 'contraindication', 'measurement', 'population', 'dose_or_schedule', 'uncertainty')),
	CONSTRAINT "knowledge_claims_epistemic_status_valid" CHECK ("knowledge_claims"."epistemic_status" in ('reported_by_source', 'supported', 'mixed', 'contested', 'unsupported', 'unknown')),
	CONSTRAINT "knowledge_claims_review_status_valid" CHECK ("knowledge_claims"."review_status" in ('candidate', 'reviewed', 'rejected', 'superseded')),
	CONSTRAINT "knowledge_claims_version_positive" CHECK ("knowledge_claims"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "knowledge_source_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"knowledge_source_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"original_file_ref" text NOT NULL,
	"original_file_name" text NOT NULL,
	"original_media_type" text NOT NULL,
	"original_content_hash" text NOT NULL,
	"parsed_text" text NOT NULL,
	"parser_id" text NOT NULL,
	"parser_version" text NOT NULL,
	"file_format" text NOT NULL,
	"extraction_quality" text NOT NULL,
	"page_or_section_map" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"processing_class" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_source_revisions_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "knowledge_source_revisions_source_number_unique" UNIQUE("knowledge_source_id","revision_number"),
	CONSTRAINT "knowledge_source_revisions_user_hash_unique" UNIQUE("user_id","original_content_hash"),
	CONSTRAINT "knowledge_source_revisions_number_positive" CHECK ("knowledge_source_revisions"."revision_number" > 0),
	CONSTRAINT "knowledge_source_revisions_hash_length" CHECK (length("knowledge_source_revisions"."original_content_hash") = 64),
	CONSTRAINT "knowledge_source_revisions_map_array" CHECK (jsonb_typeof("knowledge_source_revisions"."page_or_section_map") = 'array'),
	CONSTRAINT "knowledge_source_revisions_format_valid" CHECK ("knowledge_source_revisions"."file_format" in ('plain_text', 'markdown', 'pdf')),
	CONSTRAINT "knowledge_source_revisions_quality_valid" CHECK ("knowledge_source_revisions"."extraction_quality" in ('complete', 'partial', 'ocr_required', 'failed')),
	CONSTRAINT "knowledge_source_revisions_processing_class_valid" CHECK ("knowledge_source_revisions"."processing_class" in ('standard', 'sensitive', 'private'))
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"authors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_class" text NOT NULL,
	"publisher_or_venue" text,
	"publication_date" date,
	"doi" text,
	"canonical_url" text,
	"language" text NOT NULL,
	"owner_notes" text,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"evidence_domain" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"copyright_and_use_notes" text NOT NULL,
	"correction_status" text DEFAULT 'unknown' NOT NULL,
	"deletion_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "knowledge_sources_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "knowledge_sources_title_valid" CHECK (length(btrim("knowledge_sources"."title")) between 1 and 500),
	CONSTRAINT "knowledge_sources_authors_array" CHECK (jsonb_typeof("knowledge_sources"."authors") = 'array'),
	CONSTRAINT "knowledge_sources_evidence_domain_array" CHECK (jsonb_typeof("knowledge_sources"."evidence_domain") = 'array'),
	CONSTRAINT "knowledge_sources_class_valid" CHECK ("knowledge_sources"."source_class" in ('systematic_review_or_meta_analysis', 'randomised_trial', 'controlled_non_randomised_study', 'observational_study', 'mechanistic_or_laboratory_study', 'clinical_or_professional_guideline', 'narrative_review', 'expert_commentary', 'book_or_chapter', 'podcast_or_transcript', 'personal_notes', 'unknown')),
	CONSTRAINT "knowledge_sources_review_status_valid" CHECK ("knowledge_sources"."review_status" in ('unreviewed', 'processing', 'reviewed', 'reference_only', 'rejected', 'superseded')),
	CONSTRAINT "knowledge_sources_correction_status_valid" CHECK ("knowledge_sources"."correction_status" in ('unknown', 'none_known', 'corrected', 'retracted', 'expression_of_concern')),
	CONSTRAINT "knowledge_sources_version_positive" CHECK ("knowledge_sources"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_revision_owner_fk" FOREIGN KEY ("source_revision_id","user_id") REFERENCES "public"."knowledge_source_revisions"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_claim_citations" ADD CONSTRAINT "knowledge_claim_citations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_claim_citations" ADD CONSTRAINT "knowledge_claim_citations_claim_owner_fk" FOREIGN KEY ("claim_id","user_id") REFERENCES "public"."knowledge_claims"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_claim_citations" ADD CONSTRAINT "knowledge_claim_citations_revision_owner_fk" FOREIGN KEY ("source_revision_id","user_id") REFERENCES "public"."knowledge_source_revisions"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_claims" ADD CONSTRAINT "knowledge_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_claims" ADD CONSTRAINT "knowledge_claims_resource_owner_fk" FOREIGN KEY ("id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_claims" ADD CONSTRAINT "knowledge_claims_source_owner_fk" FOREIGN KEY ("knowledge_source_id","user_id") REFERENCES "public"."knowledge_sources"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_revisions" ADD CONSTRAINT "knowledge_source_revisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_revisions" ADD CONSTRAINT "knowledge_source_revisions_source_owner_fk" FOREIGN KEY ("knowledge_source_id","user_id") REFERENCES "public"."knowledge_sources"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_resource_owner_fk" FOREIGN KEY ("id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_chunks_user_revision_idx" ON "knowledge_chunks" USING btree ("user_id","source_revision_id","ordinal");--> statement-breakpoint
CREATE INDEX "knowledge_claim_citations_user_claim_idx" ON "knowledge_claim_citations" USING btree ("user_id","claim_id");--> statement-breakpoint
CREATE INDEX "knowledge_claims_user_source_idx" ON "knowledge_claims" USING btree ("user_id","knowledge_source_id","updated_at");--> statement-breakpoint
CREATE INDEX "knowledge_source_revisions_user_source_idx" ON "knowledge_source_revisions" USING btree ("user_id","knowledge_source_id","revision_number");--> statement-breakpoint
CREATE INDEX "knowledge_sources_user_updated_idx" ON "knowledge_sources" USING btree ("user_id","updated_at");
--> statement-breakpoint
INSERT INTO schema_registry (key, version, status, json_schema)
VALUES
  ('resource.knowledge_source', 1, 'active', '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false}'::jsonb),
  ('resource.knowledge_claim', 1, 'active', '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false}'::jsonb)
ON CONFLICT (key, version) DO NOTHING;
--> statement-breakpoint
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY knowledge_sources_owner_scope ON knowledge_sources
  USING (user_id = meridian_current_user_id())
  WITH CHECK (user_id = meridian_current_user_id());
ALTER TABLE knowledge_source_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_source_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY knowledge_source_revisions_owner_scope ON knowledge_source_revisions
  USING (user_id = meridian_current_user_id())
  WITH CHECK (user_id = meridian_current_user_id());
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks FORCE ROW LEVEL SECURITY;
CREATE POLICY knowledge_chunks_owner_scope ON knowledge_chunks
  USING (user_id = meridian_current_user_id())
  WITH CHECK (user_id = meridian_current_user_id());
ALTER TABLE knowledge_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_claims FORCE ROW LEVEL SECURITY;
CREATE POLICY knowledge_claims_owner_scope ON knowledge_claims
  USING (user_id = meridian_current_user_id())
  WITH CHECK (user_id = meridian_current_user_id());
ALTER TABLE knowledge_claim_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_claim_citations FORCE ROW LEVEL SECURITY;
CREATE POLICY knowledge_claim_citations_owner_scope ON knowledge_claim_citations
  USING (user_id = meridian_current_user_id())
  WITH CHECK (user_id = meridian_current_user_id());
--> statement-breakpoint
CREATE TRIGGER knowledge_source_revisions_reject_update
  BEFORE UPDATE ON knowledge_source_revisions
  FOR EACH ROW EXECUTE FUNCTION meridian_reject_update();
CREATE TRIGGER knowledge_chunks_reject_update
  BEFORE UPDATE ON knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION meridian_reject_update();
CREATE TRIGGER knowledge_claim_citations_reject_update
  BEFORE UPDATE ON knowledge_claim_citations
  FOR EACH ROW EXECUTE FUNCTION meridian_reject_update();
