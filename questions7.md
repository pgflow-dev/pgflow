1. default_route/route sounds really nice. lets stick to that for now.
but please explore for a little while how we could support other types of workers, for example
i would love to allow users to still keep it on the queue, but for example direct particular step to the python worker (which i will implement)
that will serve a role of a complementary processor for particular step only
would still pull from pgmq with read-with-poll and shit, not yet sure if from separate queue or just filtered using message headers
provide some exploration with an example use case and an example Flow DSL code for this use case (simplified)

2. prep is better than pre?
also, can you show an example of a prep ghost step that is inside the branch? how would it look like slug-wise? im worried that it will look like branchSlug__prep__innerStep, wouldnt it be confusing? we would probably need to reserve the word 'prep' alongiside 'output' and prohibit users from using it (and its variations with __ and shit) for their step slugs manually right?

3. yes for the  matching
but why wont we allow appending tasks when the step is created? are tasks already queued/started at this point or there are no task rows at all at this stage yet?

what you mean 'append before cancel'?

created_from is nice to have, but the name is not the best, better would be 'origin' or something like that - give some suggestions

5. review this based on the unification of the __prep ghost step

7. output step is a regular step and it will have its own dependsOn deps right, so if we want to allow overwriting this, we can add that later.

8. review this based on the __prep ghost step unification, lets think which things we need to make explicit

9. i agree with you it makes worker more complicated and we want to avoid any worker changes and make it dump, this way it is just a simple queue execution engine

OTHERS:

- how the branch gate now fits this new unified __prep ghost step model? are those separate things? is it that branch allows to skip the input preprocessing (taskless __prep) or allow to specify it (__prep with a task)? confused about this a little bit
- for throwing special tokens (SkipToken, PauseToken etc), maybe instead of throwing them we can just return them instead of a regular value? it should be easy to distinguis those probably
- if we have a single __prep can we have multiple __cond ? like an array of TS conditions? or this does not make sense and its just better to have one and have multiple conditions inside single handler?
