ALTER TABLE "oauth_authorization_sessions" ADD COLUMN "nonce_hash" text DEFAULT repeat('0', 64) NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_authorization_sessions" ALTER COLUMN "nonce_hash" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "oauth_authorization_sessions" ADD CONSTRAINT "oauth_authorization_sessions_nonce_hash" CHECK (length("oauth_authorization_sessions"."nonce_hash") = 64);
