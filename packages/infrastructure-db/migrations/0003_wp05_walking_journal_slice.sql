ALTER TABLE "entries" DROP CONSTRAINT "entries_status_valid";--> statement-breakpoint
CREATE INDEX "entry_revisions_ai_processing_idx" ON "entry_revisions" USING btree ("user_id","processing_class","created_at");--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_status_valid" CHECK ("entries"."status" in ('active', 'archived', 'deletion_requested'));--> statement-breakpoint
ALTER TABLE entry_revisions DISABLE TRIGGER USER;
UPDATE entry_revisions
SET content_hash = encode(sha256(convert_to(body_markdown, 'UTF8')), 'hex')
WHERE length(content_hash) <> 64;
ALTER TABLE entry_revisions ENABLE TRIGGER USER;
--> statement-breakpoint
ALTER TABLE "entry_revisions" ADD CONSTRAINT "entry_revisions_content_hash_length" CHECK (length("entry_revisions"."content_hash") = 64);
