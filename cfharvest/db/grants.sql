-- =====================================================================================================
-- CFHarvest replica · PostgREST grants for the DEMO (run after schema.sql and seed.sql).
--
-- DEMO ONLY. Row-level security is OFF in schema.sql, so these grants let anyone who holds the project's
-- publishable (anon) key read and change every row of every tenant in schema cfharvest. Use a
-- throw-away Supabase project or an isolated schema with fake data. Before real data: enable RLS with
-- the policy template in the header of schema.sql and replace these grants (see db/README.md).
--
-- Why DELETE as well: the replica's store (app/store.js) mirrors the plan. Avplanera removes an
-- assignment row, removing an extra landing / map symbol / template deletes its row, and the role and
-- resource-access join tables are rewritten per user. Nothing else is ever deleted by the app.
--
-- Idempotent: GRANT and ALTER DEFAULT PRIVILEGES can be repeated.
-- =====================================================================================================

GRANT USAGE ON SCHEMA cfharvest TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA cfharvest TO anon, authenticated;
GRANT DELETE ON cfharvest.assignment, cfharvest.landing, cfharvest.map_symbol, cfharvest.calendar_override,
                cfharvest.app_user_role, cfharvest.app_user_resource, cfharvest.contract_operation_type,
                cfharvest.team_member, cfharvest.message_template, cfharvest.production_message,
                cfharvest.production_line
  TO anon, authenticated;
-- work_order_status_history uses an identity column; the audit trigger inserts as the calling role.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA cfharvest TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA cfharvest TO anon, authenticated;

-- Tables added to the schema later get the same read/write grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA cfharvest GRANT SELECT, INSERT, UPDATE ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA cfharvest GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated;

-- Ask PostgREST to reload its schema cache (harmless where PostgREST does not listen).
NOTIFY pgrst, 'reload schema';
