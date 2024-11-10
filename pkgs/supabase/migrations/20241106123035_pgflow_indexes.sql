-- Index on to_step_slug in pgflow.deps
CREATE INDEX idx_deps_to_step_slug ON pgflow.deps (to_step_slug);

-- Index on from_step_slug in pgflow.deps
CREATE INDEX idx_deps_from_step_slug ON pgflow.deps (from_step_slug);

-- Optional: Index on (to_step_slug, from_step_slug) 
-- if you frequently query both columns together
CREATE INDEX idx_deps_from_step_slug_to_step_slug
ON pgflow.deps (to_step_slug, from_step_slug);

-- Optional: Index on step_slug in pgflow.step_states
-- This can help if you have queries filtering only by step_slug
CREATE INDEX idx_step_states_step_slug ON pgflow.step_states (step_slug);

-- Optional: Index on status in pgflow.step_states
-- Useful if you frequently filter by status across runs
CREATE INDEX idx_step_states_status ON pgflow.step_states (status);

-- Optional: Index on (to_step_slug, flow_slug) in pgflow.deps
-- This can improve performance for queries involving both columns
CREATE INDEX idx_deps_dependant_flow ON pgflow.deps (to_step_slug, flow_slug);
