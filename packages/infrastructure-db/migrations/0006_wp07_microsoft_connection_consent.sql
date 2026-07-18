CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"integration_account_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"action" text NOT NULL,
	"scopes" text[] NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_records_provider" CHECK ("consent_records"."provider" = 'microsoft'),
	CONSTRAINT "consent_records_action" CHECK ("consent_records"."action" in ('granted', 'disconnected', 'reauthorization_required')),
	CONSTRAINT "consent_records_stage_a_scopes" CHECK (cardinality("consent_records"."scopes") = 5 and "consent_records"."scopes" @> ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read']::text[] and "consent_records"."scopes" <@ ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read']::text[])
);
--> statement-breakpoint
CREATE TABLE "integration_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_subject_id" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text NOT NULL,
	"granted_scopes" text[] NOT NULL,
	"access_token_ciphertext" text,
	"refresh_token_ciphertext" text,
	"token_expires_at" timestamp with time zone,
	"token_key_version" integer DEFAULT 1 NOT NULL,
	"connected_at" timestamp with time zone NOT NULL,
	"disconnected_at" timestamp with time zone,
	"last_refreshed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_accounts_user_provider_unique" UNIQUE("user_id","provider"),
	CONSTRAINT "integration_accounts_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "integration_accounts_provider" CHECK ("integration_accounts"."provider" = 'microsoft'),
	CONSTRAINT "integration_accounts_status" CHECK ("integration_accounts"."status" in ('connected', 'disconnected', 'reauthorization_required')),
	CONSTRAINT "integration_accounts_key_version" CHECK ("integration_accounts"."token_key_version" = 1),
	CONSTRAINT "integration_accounts_token_state" CHECK (("integration_accounts"."status" = 'connected' and "integration_accounts"."access_token_ciphertext" is not null and "integration_accounts"."refresh_token_ciphertext" is not null and "integration_accounts"."token_expires_at" is not null and "integration_accounts"."disconnected_at" is null) or ("integration_accounts"."status" <> 'connected' and "integration_accounts"."access_token_ciphertext" is null and "integration_accounts"."refresh_token_ciphertext" is null and "integration_accounts"."token_expires_at" is null)),
	CONSTRAINT "integration_accounts_ciphertext" CHECK (("integration_accounts"."access_token_ciphertext" is null or "integration_accounts"."access_token_ciphertext" like 'v1.%') and ("integration_accounts"."refresh_token_ciphertext" is null or "integration_accounts"."refresh_token_ciphertext" like 'v1.%')),
	CONSTRAINT "integration_accounts_stage_a_scopes" CHECK (cardinality("integration_accounts"."granted_scopes") = 5 and "integration_accounts"."granted_scopes" @> ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read']::text[] and "integration_accounts"."granted_scopes" <@ ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read']::text[])
);
--> statement-breakpoint
CREATE TABLE "oauth_authorization_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"state_hash" text NOT NULL,
	"code_verifier_ciphertext" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"requested_scopes" text[] NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "oauth_authorization_sessions_state_hash_unique" UNIQUE("state_hash"),
	CONSTRAINT "oauth_authorization_sessions_provider" CHECK ("oauth_authorization_sessions"."provider" = 'microsoft'),
	CONSTRAINT "oauth_authorization_sessions_state_hash" CHECK (length("oauth_authorization_sessions"."state_hash") = 64),
	CONSTRAINT "oauth_authorization_sessions_ciphertext" CHECK ("oauth_authorization_sessions"."code_verifier_ciphertext" like 'v1.%'),
	CONSTRAINT "oauth_authorization_sessions_expiry" CHECK ("oauth_authorization_sessions"."expires_at" > "oauth_authorization_sessions"."created_at"),
	CONSTRAINT "oauth_authorization_sessions_consumed" CHECK ("oauth_authorization_sessions"."consumed_at" is null or "oauth_authorization_sessions"."consumed_at" >= "oauth_authorization_sessions"."created_at"),
	CONSTRAINT "oauth_authorization_sessions_stage_a_scopes" CHECK (cardinality("oauth_authorization_sessions"."requested_scopes") = 5 and "oauth_authorization_sessions"."requested_scopes" @> ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read']::text[] and "oauth_authorization_sessions"."requested_scopes" <@ ARRAY['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read']::text[])
);
--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_account_owner_fk" FOREIGN KEY ("integration_account_id","user_id") REFERENCES "public"."integration_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_accounts" ADD CONSTRAINT "integration_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_authorization_sessions" ADD CONSTRAINT "oauth_authorization_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_records_user_occurred_idx" ON "consent_records" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "integration_accounts_user_status_idx" ON "integration_accounts" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "oauth_authorization_sessions_expiry_idx" ON "oauth_authorization_sessions" USING btree ("expires_at");
--> statement-breakpoint
ALTER TABLE "integration_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "integration_accounts_owner_scope" ON "integration_accounts"
  USING ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "consent_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consent_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY "consent_records_owner_scope" ON "consent_records"
  USING ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('meridian.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE TRIGGER consent_records_reject_update
  BEFORE UPDATE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION meridian_reject_update();
