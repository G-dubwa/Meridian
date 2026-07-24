ALTER TABLE "today_receipts" ADD CONSTRAINT "today_receipts_id_user_unique" UNIQUE("id","user_id");
--> statement-breakpoint
CREATE TABLE "execution_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"calendar_block_id" uuid,
	"task_id" uuid,
	"source_receipt_id" uuid,
	"confidence_class" text NOT NULL,
	"evidence_type" text NOT NULL,
	"outcome" text NOT NULL,
	"source" text NOT NULL,
	"reported_duration_minutes" integer,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"retracted_at" timestamp with time zone,
	"retraction_reason" text,
	CONSTRAINT "execution_records_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "execution_records_block_user_unique" UNIQUE("calendar_block_id","user_id"),
	CONSTRAINT "execution_records_receipt_user_unique" UNIQUE("source_receipt_id","user_id"),
	CONSTRAINT "execution_records_target_valid" CHECK ("execution_records"."calendar_block_id" is not null or "execution_records"."task_id" is not null),
	CONSTRAINT "execution_records_evidence_type_valid" CHECK ("execution_records"."evidence_type" in ('user_completed_task', 'post_block_confirmed', 'focus_session_recorded', 'external_task_completed', 'calendar_elapsed_unknown', 'user_reported_not_done')),
	CONSTRAINT "execution_records_confidence_class_valid" CHECK ("execution_records"."confidence_class" in ('owner_confirmed', 'locally_observed', 'externally_confirmed', 'unknown')),
	CONSTRAINT "execution_records_evidence_confidence_valid" CHECK (("execution_records"."evidence_type" in ('user_completed_task', 'post_block_confirmed', 'user_reported_not_done') and "execution_records"."confidence_class" = 'owner_confirmed') or ("execution_records"."evidence_type" = 'focus_session_recorded' and "execution_records"."confidence_class" = 'locally_observed') or ("execution_records"."evidence_type" = 'external_task_completed' and "execution_records"."confidence_class" = 'externally_confirmed') or ("execution_records"."evidence_type" = 'calendar_elapsed_unknown' and "execution_records"."confidence_class" = 'unknown')),
	CONSTRAINT "execution_records_outcome_valid" CHECK ("execution_records"."outcome" in ('confirmed_completed', 'confirmed_partial', 'unknown', 'not_completed', 'rescheduled')),
	CONSTRAINT "execution_records_source_valid" CHECK ("execution_records"."source" in ('today_task_completion', 'post_block_confirmation', 'elapsed_block_reconciliation')),
	CONSTRAINT "execution_records_duration_valid" CHECK ("execution_records"."reported_duration_minutes" is null or "execution_records"."reported_duration_minutes" > 0),
	CONSTRAINT "execution_records_retraction_valid" CHECK (("execution_records"."retracted_at" is null and "execution_records"."retraction_reason" is null) or ("execution_records"."retracted_at" is not null and "execution_records"."retraction_reason" = 'owner_undo'))
);
--> statement-breakpoint
ALTER TABLE "execution_records" ADD CONSTRAINT "execution_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_records" ADD CONSTRAINT "execution_records_block_owner_fk" FOREIGN KEY ("calendar_block_id","user_id") REFERENCES "public"."calendar_blocks"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_records" ADD CONSTRAINT "execution_records_task_owner_fk" FOREIGN KEY ("task_id","user_id") REFERENCES "public"."tasks"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_records" ADD CONSTRAINT "execution_records_receipt_owner_fk" FOREIGN KEY ("source_receipt_id","user_id") REFERENCES "public"."today_receipts"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "execution_records_user_occurred_idx" ON "execution_records" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "execution_records_user_block_idx" ON "execution_records" USING btree ("user_id","calendar_block_id");
--> statement-breakpoint
ALTER TABLE "execution_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "execution_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY "execution_records_owner_scope" ON "execution_records"
  USING ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid);
