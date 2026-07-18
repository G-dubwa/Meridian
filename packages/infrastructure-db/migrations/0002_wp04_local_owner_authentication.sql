CREATE TABLE "auth_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"user_id" uuid NOT NULL,
	"identifier" text NOT NULL,
	"password_hash" text NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_credentials_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "auth_credentials_identifier_unique" UNIQUE("identifier"),
	CONSTRAINT "auth_credentials_singleton_unique" UNIQUE("singleton"),
	CONSTRAINT "auth_credentials_singleton_true" CHECK ("auth_credentials"."singleton" = true),
	CONSTRAINT "auth_credentials_identifier_normalized" CHECK ("auth_credentials"."identifier" = lower("auth_credentials"."identifier")),
	CONSTRAINT "auth_credentials_argon2id_hash" CHECK ("auth_credentials"."password_hash" like '$argon2id$%'),
	CONSTRAINT "auth_credentials_failures_nonnegative" CHECK ("auth_credentials"."failed_attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "auth_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"event_type" text NOT NULL,
	"outcome" text NOT NULL,
	"reason_code" text,
	"request_id" uuid NOT NULL,
	"client_fingerprint_hash" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_events_type_valid" CHECK ("auth_events"."event_type" in ('owner_bootstrapped', 'login_succeeded', 'login_failed', 'logout', 'session_renewed', 'password_changed', 'recovery_code_used', 'sessions_revoked')),
	CONSTRAINT "auth_events_outcome_valid" CHECK ("auth_events"."outcome" in ('succeeded', 'rejected')),
	CONSTRAINT "auth_events_reason_valid" CHECK ("auth_events"."reason_code" is null or "auth_events"."reason_code" in ('credentials_invalid', 'credential_locked', 'rate_limited', 'session_invalid', 'csrf_invalid', 'recovery_code_invalid')),
	CONSTRAINT "auth_events_fingerprint_hash_length" CHECK (length("auth_events"."client_fingerprint_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"blocked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_rate_limits_key_hash_length" CHECK (length("auth_rate_limits"."key_hash") = 64),
	CONSTRAINT "auth_rate_limits_attempts_nonnegative" CHECK ("auth_rate_limits"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "auth_sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "auth_sessions_token_hash_length" CHECK (length("auth_sessions"."token_hash") = 64),
	CONSTRAINT "auth_sessions_csrf_hash_length" CHECK (length("auth_sessions"."csrf_token_hash") = 64),
	CONSTRAINT "auth_sessions_expiry_order" CHECK ("auth_sessions"."idle_expires_at" <= "auth_sessions"."absolute_expires_at")
);
--> statement-breakpoint
CREATE TABLE "recovery_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "recovery_codes_code_hash_unique" UNIQUE("code_hash"),
	CONSTRAINT "recovery_codes_hash_length" CHECK (length("recovery_codes"."code_hash") = 64)
);
--> statement-breakpoint
ALTER TABLE "auth_credentials" ADD CONSTRAINT "auth_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_events_user_occurred_idx" ON "auth_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "auth_events_request_idx" ON "auth_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "auth_rate_limits_updated_idx" ON "auth_rate_limits" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_active_idx" ON "auth_sessions" USING btree ("user_id","revoked_at","idle_expires_at");--> statement-breakpoint
CREATE INDEX "recovery_codes_user_active_idx" ON "recovery_codes" USING btree ("user_id","used_at");--> statement-breakpoint
CREATE TRIGGER auth_events_reject_update
  BEFORE UPDATE ON auth_events
  FOR EACH ROW EXECUTE FUNCTION meridian_reject_update();
