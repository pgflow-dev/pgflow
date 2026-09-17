-- Pre-final-migration seed: each target case is valid at 0.16.0 but invalid
-- under the #651 slug rules or normalized step uniqueness. The fixture runner
-- applies one case per fresh database and checks full transaction rollback.
--
-- The runner replaces __CASE__ before sending this file to psql.

DO $$
BEGIN
  CASE '__CASE__'
    WHEN 'leading_flow' THEN
      INSERT INTO pgflow.flows (flow_slug) VALUES ('_leading');
    WHEN 'trailing_flow' THEN
      INSERT INTO pgflow.flows (flow_slug) VALUES ('trailing_');
    WHEN 'double_flow' THEN
      INSERT INTO pgflow.flows (flow_slug) VALUES ('double__flow');
    WHEN 'leading_step' THEN
      INSERT INTO pgflow.flows (flow_slug) VALUES ('validflow');
      INSERT INTO pgflow.steps (flow_slug, step_slug, step_index, deps_count)
      VALUES ('validflow', '_leading', 0, 0);
    WHEN 'trailing_step' THEN
      INSERT INTO pgflow.flows (flow_slug) VALUES ('validflow');
      INSERT INTO pgflow.steps (flow_slug, step_slug, step_index, deps_count)
      VALUES ('validflow', 'trailing_', 0, 0);
    WHEN 'double_step' THEN
      INSERT INTO pgflow.flows (flow_slug) VALUES ('validflow');
      INSERT INTO pgflow.steps (flow_slug, step_slug, step_index, deps_count)
      VALUES ('validflow', 'double__step', 0, 0);
    WHEN 'case_only_steps' THEN
      INSERT INTO pgflow.flows (flow_slug) VALUES ('validflow');
      INSERT INTO pgflow.steps (flow_slug, step_slug, step_index, deps_count)
      VALUES
        ('validflow', 'First', 0, 0),
        ('validflow', 'first', 1, 0);
    ELSE
      RAISE EXCEPTION 'unknown fixture case: %', '__CASE__';
  END CASE;
END
$$;
