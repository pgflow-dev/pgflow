-- Get flow shape from database as JSONB
-- Returns structure matching TypeScript FlowShape interface:
-- { "steps": [{ "slug": "...", "stepType": "...", "dependencies": [...] }] }
create or replace function pgflow._get_flow_shape(p_flow_slug text)
returns jsonb
language sql
stable
set search_path to ''
as $$
  SELECT jsonb_build_object(
    'steps',
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'slug', step.step_slug,
          'stepType', step.step_type,
          'dependencies', COALESCE(
            (
              SELECT jsonb_agg(dep.dep_slug ORDER BY dep.dep_slug)
              FROM pgflow.deps AS dep
              WHERE dep.flow_slug = step.flow_slug
                AND dep.step_slug = step.step_slug
            ),
            '[]'::jsonb
          ),
          'whenUnmet', step.when_unmet,
          'whenFailed', step.when_failed,
          'requiredInputPattern', CASE
            WHEN step.required_input_pattern IS NULL
            THEN '{"defined": false}'::jsonb
            ELSE jsonb_build_object('defined', true, 'value', step.required_input_pattern)
          END,
          'forbiddenInputPattern', CASE
            WHEN step.forbidden_input_pattern IS NULL
            THEN '{"defined": false}'::jsonb
            ELSE jsonb_build_object('defined', true, 'value', step.forbidden_input_pattern)
          END
        )
        ORDER BY step.step_index
      ),
      '[]'::jsonb
    )
  )
  FROM pgflow.steps AS step
  WHERE step.flow_slug = p_flow_slug;
$$;
