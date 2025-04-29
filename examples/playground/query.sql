select 
  step_slug, 
  max(completed_at - started_at),
  min(completed_at - started_at),
  avg(completed_at - started_at)
from pgflow.step_states
group by step_slug
