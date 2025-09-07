1. i was not precise, the human-in-the-loop steps are really just manual, those are not restricted to humans, its just that this is the obvious use case. the main thing is that there is no queue and tasks are not queued, they are immediately started
human is too specific, its more about if it uses the queue or not, but may be other things in future too

2. both .branch() (branchInput) and .fanout() (array) are using this really as an input preprocessing,
but 'input' does not play well with 'fanout' imo (not sure) - can you give some generic name suggestions so i can check if it even can be improved?
i mean, those generic ghost steps can have a shared slug prefix, like __input or __pre or similar maybe? and .fanout()/.branch() can just use their own names (array/input) in dsl but add ghost steps with __input/__pre

3. it should be possible to append both manual and qaueued tasks, but it should not be possible to append a taks with this mode different than the default set on the steps right? it should be validated by this function. if we ever need to append non-default, we will create dedicated functions

5. - json condition cannot fail, it always resolves to boolean
   - TS conditions can fail indeed, so for TS conditions handlers
     - if returning true means step is skipped, so failure_reason is null
     - if returning false means step is not skipped but started, so failure_reason is null
     - if throwing an error, means step is not skipped and not started, so failure_reason is set to condition_error
   - preprocessing_error would handle only this single input-preprocessing ghost step that both .branch() and .fanout() are using
     it should only happen if the preprocessing handler throws an error

  im confused as tasks cannot be skipped or cancelled and cannot have conditions nor preprocessing ghost steps, only can have error or timeout
  but steps can have condition_error, preprocessing_error, cancelled or skipped, but cannot have error nor timeout right? (confusing as timeout suggests 'how long step can run' but it should rather be for 'how long task can execute')
we should probably have failure reasons on both right?
maybe step should have its own plus task-related with task_ prefix, copied?
so if task fails with error, task will have failure_reason=error, and step will have failure_reason=task_error (or timeout + task_timeout)

what do you think?

7. it makes sense, but what if there is some leaf step that returns huge output that we do not want?
maybe im overly protective, because if you dont want leaf step output in the run output, just return null or undefined from the leaf step handler,, so run output would have { leaf: null } - would that solve it?

and in case the output wants to have some other, non leaf task output included, what would we do? is it fine/ok to just prohibit it?

8. is it even valuable to add those meta_ columns now? are those meta informations available to be inferred from other colums?
for example is_ghost can be inferred from the slug - ghost steps start with __ right?
list all this meta columns and review if all of them can be inferred
then provide recommendation on if it is worth to add them, because if we will be having a UI-specific sql view for the paused/cancelled virtual statuses, maybe we can also put those meta colums into this view too?

9. lets list all our ghost steps

first, ones that are mutually exclusive:
  - fanout input preprocessing (required in dsl)
  - branch input preprocessing (optional in dsl)

then, ones that should really run before the preprocessing ones:
  - condition ghost step

do we really need two "levels" of the ghost steps? what if we just implement a generic preprocessing ghost step that just transforms input and its return value is used as new input (basic rule)
if we would like to have a skip condition represented as TS function, maybe we can use a special exception class or make them throw particular symbol (for example SkipToken('reason') or FailToken('reason')), this way a single mechanic (ghost step) can serve both input preprocessing and also skip conditions and conditional failures, or even conditional cancellation (CancelToken('reason')) or conditional pausing (PauseToken('reason'))
this would require adding some changes to the worker, to handle those tokens, but would be very flexible

what are the limitations, issues and misunderstandings with this approach?
