ALTER TABLE "outbox_messages" ADD COLUMN "last_error_code" text;
--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD COLUMN "last_error_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD COLUMN "dead_lettered_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "outbox_messages"
SET "processed_at" = coalesce("processed_at", "created_at")
WHERE "status" = 'succeeded';
--> statement-breakpoint
UPDATE "outbox_messages"
SET
  "last_error_code" = 'LEGACY_FAILURE',
  "last_error_at" = coalesce("processed_at", "created_at"),
  "dead_lettered_at" = coalesce("processed_at", "created_at"),
  "processed_at" = null
WHERE "status" = 'failed';
--> statement-breakpoint
UPDATE "outbox_messages"
SET "processed_at" = null
WHERE "status" not in ('succeeded', 'failed');
--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_error_code_valid" CHECK ("outbox_messages"."last_error_code" is null or "outbox_messages"."last_error_code" ~ '^[A-Z][A-Z0-9_]{2,63}$');
--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_terminal_state_valid" CHECK (("outbox_messages"."status" = 'succeeded' and "outbox_messages"."processed_at" is not null and "outbox_messages"."dead_lettered_at" is null) or ("outbox_messages"."status" = 'failed' and "outbox_messages"."processed_at" is null and "outbox_messages"."dead_lettered_at" is not null and "outbox_messages"."last_error_code" is not null) or ("outbox_messages"."status" not in ('succeeded', 'failed') and "outbox_messages"."processed_at" is null and "outbox_messages"."dead_lettered_at" is null));
