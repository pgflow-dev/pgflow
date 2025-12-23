-- Type definitions
create type pgflow.step_task_record as (
  flow_slug text,
  run_id uuid,
  step_slug text,
  input jsonb,
  msg_id bigint,
  task_index int,
  flow_input jsonb
);
