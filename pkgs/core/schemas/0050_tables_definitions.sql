-- Core flow definition tables

-- Flows table - stores flow definitions
create table pgflow.flows (
  flow_slug text primary key not null,  -- Unique identifier for the flow
  opt_max_attempts int not null default 3,
  opt_base_delay int not null default 1,
  opt_timeout int not null default 60,
  constraint slug_is_valid check (pgflow.is_valid_slug(flow_slug)),
  constraint opt_max_attempts_is_nonnegative check (opt_max_attempts >= 0),
  constraint opt_base_delay_is_nonnegative check (opt_base_delay >= 0),
  constraint opt_timeout_is_positive check (opt_timeout > 0)
);

-- Steps table - stores individual steps within flows
create table pgflow.steps (
  flow_slug text not null references pgflow.flows (flow_slug),
  step_slug text not null,
  step_type text not null default 'single',
  step_index int not null default 0,
  deps_count int not null default 0 check (deps_count >= 0),
  opt_max_attempts int,
  opt_base_delay int,
  opt_timeout int,
  primary key (flow_slug, step_slug),
  unique (flow_slug, step_index),  -- Ensure step_index is unique within a flow
  check (pgflow.is_valid_slug(step_slug)),
  check (step_type in ('single')),
  constraint opt_max_attempts_is_nonnegative check (opt_max_attempts is null or opt_max_attempts >= 0),
  constraint opt_base_delay_is_nonnegative check (opt_base_delay is null or opt_base_delay >= 0),
  constraint opt_timeout_is_positive check (opt_timeout is null or opt_timeout > 0)
);

-- Dependencies table - stores relationships between steps
create table pgflow.deps (
  flow_slug text not null references pgflow.flows (flow_slug),
  dep_slug text not null, -- slug of the dependency
  step_slug text not null, -- slug of the dependent
  primary key (flow_slug, dep_slug, step_slug),
  foreign key (flow_slug, dep_slug)
  references pgflow.steps (flow_slug, step_slug),
  foreign key (flow_slug, step_slug)
  references pgflow.steps (flow_slug, step_slug),
  check (dep_slug != step_slug)  -- Prevent self-dependencies
);

create index if not exists idx_deps_by_flow_step on pgflow.deps (flow_slug, step_slug);
create index if not exists idx_deps_by_flow_dep on pgflow.deps (flow_slug, dep_slug);
