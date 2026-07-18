CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
INSERT INTO schema_registry (key, version, status, json_schema)
VALUES
  ('resource.entry', 1, 'active', '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false}'::jsonb),
  ('attrs.entry', 1, 'active', '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object"}'::jsonb)
ON CONFLICT (key, version) DO NOTHING;
--> statement-breakpoint
ALTER TABLE entries
  ADD CONSTRAINT entries_current_revision_owner_fk
  FOREIGN KEY (current_revision_id, user_id)
  REFERENCES entry_revisions (id, user_id)
  ON DELETE SET NULL (current_revision_id)
  DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE domain_events
  ADD CONSTRAINT domain_events_aggregate_owner_fk
  FOREIGN KEY (aggregate_id, user_id)
  REFERENCES resources (id, user_id)
  ON DELETE SET NULL (aggregate_id);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION meridian_current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT nullif(current_setting('meridian.user_id', true), '')::uuid
$$;
--> statement-breakpoint
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_owner_scope ON users
  USING (id = meridian_current_user_id())
  WITH CHECK (id = meridian_current_user_id());
--> statement-breakpoint
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources FORCE ROW LEVEL SECURITY;
CREATE POLICY resources_owner_scope ON resources
  USING (user_id = meridian_current_user_id())
  WITH CHECK (user_id = meridian_current_user_id());
--> statement-breakpoint
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries FORCE ROW LEVEL SECURITY;
CREATE POLICY entries_owner_scope ON entries
  USING (user_id = meridian_current_user_id())
  WITH CHECK (user_id = meridian_current_user_id());
--> statement-breakpoint
ALTER TABLE entry_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY entry_revisions_owner_scope ON entry_revisions
  USING (user_id = meridian_current_user_id())
  WITH CHECK (user_id = meridian_current_user_id());
--> statement-breakpoint
ALTER TABLE derivation_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE derivation_links FORCE ROW LEVEL SECURITY;
CREATE POLICY derivation_links_owner_scope ON derivation_links
  USING (user_id = meridian_current_user_id())
  WITH CHECK (user_id = meridian_current_user_id());
--> statement-breakpoint
ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_events FORCE ROW LEVEL SECURITY;
CREATE POLICY domain_events_owner_scope ON domain_events
  USING (user_id = meridian_current_user_id())
  WITH CHECK (user_id = meridian_current_user_id());
--> statement-breakpoint
ALTER TABLE outbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_messages_owner_scope ON outbox_messages
  USING (user_id = meridian_current_user_id())
  WITH CHECK (user_id = meridian_current_user_id());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION meridian_reject_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only and cannot be updated', TG_TABLE_NAME
    USING ERRCODE = '55000';
END
$$;
--> statement-breakpoint
CREATE TRIGGER entry_revisions_reject_update
  BEFORE UPDATE ON entry_revisions
  FOR EACH ROW EXECUTE FUNCTION meridian_reject_update();
CREATE TRIGGER domain_events_reject_update
  BEFORE UPDATE ON domain_events
  FOR EACH ROW EXECUTE FUNCTION meridian_reject_update();
