currently the 'input' jsonb that we are building contains only the 'run' input

we really want to have this jsonb to contain all the deps outputs
by dep output i mean a step_tasks.output value that corresponds to step_states row that is a dependency of the given updated_step_tasks (via step_states->steps)
the step_slug of a given dependency should be used as key and its output as value in the input jsonb

so, if a given updated_step_task belongs to step_state, that have 2 dependencies:

step_slug=dep_a output=123
step_slug=dep_b output=456

we would like the final 'input' jsonb to look like this:

{
  "run": r.input,
  "dep_a": dep_a_step_task.output,
  "dep_b": dep_b_step_task.output
}

write appropriate joins and augment this code with this requirements
