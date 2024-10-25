-- pgqueuer
ALTER TABLE pgqueuer ENABLE ROW LEVEL SECURITY;
CREATE POLICY pgqueuer_service_role_policy ON pgqueuer
TO service_role
USING (true)
WITH CHECK (true);

-- pgqueuer_statistics
ALTER TABLE pgqueuer_statistics ENABLE ROW LEVEL SECURITY;
CREATE POLICY pgqueuer_statistics_service_role_policy ON pgqueuer_statistics
TO service_role
USING (true)
WITH CHECK (true);
