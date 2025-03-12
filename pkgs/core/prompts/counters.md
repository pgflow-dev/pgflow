.file `cat supabase/migrations/*.sql step_types_prompt.md declarative_sql_prompt.md` -- i need to implement multiple tasks per step state
but completion of step_task should be done i serial so only the last task can complete a step this way
we should also complete the step_states somehow in serial, because if we have few sibling steps running in parallel
that are dependencies to a dependent step, the last completed should start the dependent right?

i was thinking that for the tasks maybe i can add a remaining_tasks integer couner on step_states and decrement it with FOR UPDATE each time a task is completed,
this way i can have the completions done in series, and also can use RETURNING * to get a fresh value of a counter regardless of having an outdated snapshot (we run single statement)

but i am not sure how i can implement the similar idea for the completion of step_states, because they does not have "a parent" and can be dependencies of multiple dependent steps
should each step_state have the completed_deps counter and we should increment it with FOR UPDATE each time a step_state is completed?
