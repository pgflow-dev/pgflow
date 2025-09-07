1. i like that idea of another concern. but maybe it will be possible to have arbitrary runners and tag them? edge worker would have default of 'node' or 'deno', but if you need to have one worker on super strong machine, it would be possible to override it and tag it with for example 'deno_strong' and then set runner=deno_strong, which would make those messages to particular worker?
love this idea!

2. i agree with the naming (__prep)
i do nto understand the naming scheme for ghost steps inside a branch
can you create a template-like showcase and also few examples? i want to make sure it will not be confusing or unambiguous
also describe the most complez chain where there is condition, prep and gate etc and show all the dependencies, what depends on what

3. i agree with the mvp rule of appending only when started
i like 'origin' field name, and also spawned_by, but i do not like the possible values of seed/append
create few more examples matching the fields i like with possible, matching values

5. tasks cannot have condition or preprocessing or cancelled failure_reasons

it is kinda confusing still for me. if the steps terminal failures comes from tasks, maybe steps' error_message should be a meta column (eg inferred in the view?)

but i see one more failure reason - if the step type is fanout and the __prep step returns non-array value, it is invalid state and cannot continue, as the sql core will not be able to spawn multiple tasks for non-array value - should we guard this runtime inside sql core?

7. perfect, seems like we do not block ourselves at all, just simplify for mvp

8. but slugs are concatenated from branch slugs etc and i feel like you havent thought it through enough yet, make sure to show me few examples on how this would work for various cases, maybe in a table, with deps, slug, etc

show all examples for step with cond, prep, a branch gate with prop and cond etc



MORE:

- make sure that we still understand that step_type can apply to tasked steps? i want to be able to implement the data collection for the sent surveys as step_type=fanout runner=direct way, so we have multiple tasks that must be completed directly
