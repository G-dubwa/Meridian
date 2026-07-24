CREATE TABLE "context_manifest_items" (
	"manifest_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"evidence_lane" text NOT NULL,
	"source_kind" text,
	"resource_id" uuid,
	"entry_revision_id" uuid,
	"knowledge_chunk_id" uuid,
	"knowledge_source_revision_id" uuid,
	"content_hash" text,
	"methods" text[] DEFAULT '{}' NOT NULL,
	"score" numeric(10, 8),
	"policy_reference" text,
	CONSTRAINT "context_manifest_items_manifest_id_ordinal_pk" PRIMARY KEY("manifest_id","ordinal"),
	CONSTRAINT "context_manifest_items_ordinal_positive" CHECK ("context_manifest_items"."ordinal" > 0),
	CONSTRAINT "context_manifest_items_lane_valid" CHECK ("context_manifest_items"."evidence_lane" in ('personal_evidence', 'external_evidence', 'system_policy')),
	CONSTRAINT "context_manifest_items_methods_valid" CHECK ("context_manifest_items"."methods" <@ ARRAY['pinned', 'metadata', 'full_text', 'semantic']::text[]),
	CONSTRAINT "context_manifest_items_score_valid" CHECK ("context_manifest_items"."score" is null or ("context_manifest_items"."score" >= 0 and "context_manifest_items"."score" <= 1)),
	CONSTRAINT "context_manifest_items_reference_valid" CHECK (("context_manifest_items"."evidence_lane" = 'system_policy' and "context_manifest_items"."source_kind" is null and "context_manifest_items"."resource_id" is null and "context_manifest_items"."entry_revision_id" is null and "context_manifest_items"."knowledge_chunk_id" is null and "context_manifest_items"."knowledge_source_revision_id" is null and "context_manifest_items"."content_hash" is null and cardinality("context_manifest_items"."methods") = 0 and "context_manifest_items"."score" is null and "context_manifest_items"."policy_reference" is not null) or ("context_manifest_items"."evidence_lane" = 'personal_evidence' and "context_manifest_items"."source_kind" = 'entry_revision' and "context_manifest_items"."resource_id" is not null and "context_manifest_items"."entry_revision_id" is not null and "context_manifest_items"."knowledge_chunk_id" is null and "context_manifest_items"."knowledge_source_revision_id" is null and "context_manifest_items"."content_hash" is not null and cardinality("context_manifest_items"."methods") > 0 and "context_manifest_items"."score" is not null and "context_manifest_items"."policy_reference" is null) or ("context_manifest_items"."evidence_lane" = 'external_evidence' and "context_manifest_items"."source_kind" = 'knowledge_chunk' and "context_manifest_items"."resource_id" is not null and "context_manifest_items"."entry_revision_id" is null and "context_manifest_items"."knowledge_chunk_id" is not null and "context_manifest_items"."knowledge_source_revision_id" is not null and "context_manifest_items"."content_hash" is not null and cardinality("context_manifest_items"."methods") > 0 and "context_manifest_items"."score" is not null and "context_manifest_items"."policy_reference" is null)),
	CONSTRAINT "context_manifest_items_hash_length" CHECK ("context_manifest_items"."content_hash" is null or length("context_manifest_items"."content_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE "context_manifests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"policy_version" text NOT NULL,
	"semantic_retrieval_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "context_manifests_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "context_manifests_purpose_valid" CHECK ("context_manifests"."purpose" in ('recall_preview', 'material_response')),
	CONSTRAINT "context_manifests_policy_valid" CHECK (length(btrim("context_manifests"."policy_version")) between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "retrieval_embeddings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"lane" text NOT NULL,
	"source_kind" text NOT NULL,
	"entry_revision_id" uuid,
	"knowledge_chunk_id" uuid,
	"content_hash" text NOT NULL,
	"model_id" text NOT NULL,
	"model_version" text NOT NULL,
	"dimensions" integer NOT NULL,
	"embedding" vector NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retrieval_embeddings_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "retrieval_embeddings_entry_model_unique" UNIQUE("user_id","entry_revision_id","model_id","model_version"),
	CONSTRAINT "retrieval_embeddings_chunk_model_unique" UNIQUE("user_id","knowledge_chunk_id","model_id","model_version"),
	CONSTRAINT "retrieval_embeddings_lane_source_valid" CHECK (("retrieval_embeddings"."lane" = 'personal' and "retrieval_embeddings"."source_kind" = 'entry_revision' and "retrieval_embeddings"."entry_revision_id" is not null and "retrieval_embeddings"."knowledge_chunk_id" is null) or ("retrieval_embeddings"."lane" = 'external' and "retrieval_embeddings"."source_kind" = 'knowledge_chunk' and "retrieval_embeddings"."entry_revision_id" is null and "retrieval_embeddings"."knowledge_chunk_id" is not null)),
	CONSTRAINT "retrieval_embeddings_hash_length" CHECK (length("retrieval_embeddings"."content_hash") = 64),
	CONSTRAINT "retrieval_embeddings_model_valid" CHECK (length(btrim("retrieval_embeddings"."model_id")) between 1 and 120 and length(btrim("retrieval_embeddings"."model_version")) between 1 and 120),
	CONSTRAINT "retrieval_embeddings_dimensions_valid" CHECK ("retrieval_embeddings"."dimensions" between 1 and 16000 and vector_dims("retrieval_embeddings"."embedding") = "retrieval_embeddings"."dimensions"),
	CONSTRAINT "retrieval_embeddings_vector_nonzero" CHECK (vector_norm("retrieval_embeddings"."embedding") > 0)
);
--> statement-breakpoint
ALTER TABLE "context_manifest_items" ADD CONSTRAINT "context_manifest_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_manifest_items" ADD CONSTRAINT "context_manifest_items_manifest_owner_fk" FOREIGN KEY ("manifest_id","user_id") REFERENCES "public"."context_manifests"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_manifest_items" ADD CONSTRAINT "context_manifest_items_resource_owner_fk" FOREIGN KEY ("resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_manifest_items" ADD CONSTRAINT "context_manifest_items_entry_owner_fk" FOREIGN KEY ("entry_revision_id","user_id") REFERENCES "public"."entry_revisions"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_manifest_items" ADD CONSTRAINT "context_manifest_items_chunk_owner_fk" FOREIGN KEY ("knowledge_chunk_id","user_id") REFERENCES "public"."knowledge_chunks"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_manifest_items" ADD CONSTRAINT "context_manifest_items_revision_owner_fk" FOREIGN KEY ("knowledge_source_revision_id","user_id") REFERENCES "public"."knowledge_source_revisions"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_manifests" ADD CONSTRAINT "context_manifests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_embeddings" ADD CONSTRAINT "retrieval_embeddings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_embeddings" ADD CONSTRAINT "retrieval_embeddings_entry_owner_fk" FOREIGN KEY ("entry_revision_id","user_id") REFERENCES "public"."entry_revisions"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_embeddings" ADD CONSTRAINT "retrieval_embeddings_chunk_owner_fk" FOREIGN KEY ("knowledge_chunk_id","user_id") REFERENCES "public"."knowledge_chunks"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "context_manifest_items_user_manifest_idx" ON "context_manifest_items" USING btree ("user_id","manifest_id","ordinal");--> statement-breakpoint
CREATE INDEX "context_manifests_user_created_idx" ON "context_manifests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "retrieval_embeddings_user_lane_model_idx" ON "retrieval_embeddings" USING btree ("user_id","lane","model_id","model_version");
--> statement-breakpoint
ALTER TABLE context_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_manifests FORCE ROW LEVEL SECURITY;
CREATE POLICY context_manifests_owner_scope ON context_manifests
  USING (user_id = meridian_current_user_id())
  WITH CHECK (user_id = meridian_current_user_id());
ALTER TABLE context_manifest_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_manifest_items FORCE ROW LEVEL SECURITY;
CREATE POLICY context_manifest_items_owner_scope ON context_manifest_items
  USING (user_id = meridian_current_user_id())
  WITH CHECK (user_id = meridian_current_user_id());
ALTER TABLE retrieval_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE retrieval_embeddings FORCE ROW LEVEL SECURITY;
CREATE POLICY retrieval_embeddings_owner_scope ON retrieval_embeddings
  USING (user_id = meridian_current_user_id())
  WITH CHECK (user_id = meridian_current_user_id());
--> statement-breakpoint
CREATE FUNCTION meridian_validate_retrieval_embedding_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lane = 'personal' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM entry_revisions revision
      WHERE revision.id = NEW.entry_revision_id
        AND revision.user_id = NEW.user_id
        AND revision.processing_class = 'standard'
        AND revision.content_hash = NEW.content_hash
    ) THEN
      RAISE EXCEPTION 'retrieval embedding source is not Standard and owner eligible';
    END IF;
  ELSIF NEW.lane = 'external' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM knowledge_chunks chunk
      JOIN knowledge_source_revisions revision
        ON revision.id = chunk.source_revision_id
       AND revision.user_id = chunk.user_id
      JOIN knowledge_sources source
        ON source.id = revision.knowledge_source_id
       AND source.user_id = revision.user_id
      WHERE chunk.id = NEW.knowledge_chunk_id
        AND chunk.user_id = NEW.user_id
        AND revision.processing_class = 'standard'
        AND chunk.content_hash = NEW.content_hash
        AND source.deletion_requested_at IS NULL
    ) THEN
      RAISE EXCEPTION 'retrieval embedding source is not Standard and owner eligible';
    END IF;
  ELSE
    RAISE EXCEPTION 'retrieval embedding lane is invalid';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retrieval_embeddings_validate_source
  BEFORE INSERT ON retrieval_embeddings
  FOR EACH ROW EXECUTE FUNCTION meridian_validate_retrieval_embedding_source();
CREATE TRIGGER retrieval_embeddings_reject_update
  BEFORE UPDATE ON retrieval_embeddings
  FOR EACH ROW EXECUTE FUNCTION meridian_reject_update();
CREATE TRIGGER context_manifests_reject_update
  BEFORE UPDATE ON context_manifests
  FOR EACH ROW EXECUTE FUNCTION meridian_reject_update();
CREATE TRIGGER context_manifest_items_reject_update
  BEFORE UPDATE ON context_manifest_items
  FOR EACH ROW EXECUTE FUNCTION meridian_reject_update();
