1) maybe default_execution_type instead of work_type on steps and execution_type on tasks?
   or even be more precise - it is really manual failure/completion versus queue-based via worker
   so processing_type? or what? 
   if we gather survey info, its not really execution right?
   suggest better naming for this concern - try to distill it to the core then it will be obvious
   on other hand it is still work, worker does work, and human also does some work (things and provides answer) which we capture the output of

2) im not yet sure how to handle that, would just documenting that "for now" users need to create an explicit preparation step be a better choice?
   but then, this is my first task for my client and he immediately needs the fanout of the manual tasks, those will probably need both the emails and some metadata like tenant_id etc.

   my initial idea was to make handler use just item like this: (item) => .....
   but maybe we should make it ({ item, run }) => ....
   this way we can swap how the 'run' is filled in?
   there is also an issue with thix context.run getter - it must be async, which makes it kinda suck
   ideally we would just have the 'run' in the input, like the above ({ item, run }) but only explicitely, if user requests it, otherwise we will end up with having both array item and whole array in the handler arguments

   this needs more brainstorming - give me multiple proposals, for the simple mvp that can be expanded later and also alternative ideas

   lets remove fanoutFrom

   another idea would be to just have this preprocessing, so, you can specify fanout: true and then you will only have (item) => ....

   ```ts
   .step({
     slug: 'send_surveys',
     dependsOn: ['load_survey_participants'],
     fanout: true
   }, (item) => 'item is just one item from the array returned by load_survey_participants')
   ```
   
   but if you do preprocessing you can have whatever:

   
   ```ts
   .step({
     slug: 'send_surveys',
     dependsOn: ['load_survey_participants'],
     fanout: (item, input, context) => [item, input.run.tenant_id]
   }, ([item, tenant_id]) => ...)
   ```

   there is also one more limitation - fanout step cannot be the root step, which kinda sucks, as i imagine lot of the flows would be started with an array value and would immediately want to fanout

   maybe we should make the `fanout` always be a function which must return an array of items for particular tasks?
   this would allow us to make fanout steps not be limited to have a single dependency:

   ```ts
   .step({
     slug: 'send_surveys',
     dependsOn: ['participants', 'questions'],
     fanout: ({ participants, questions }, context) => participants.map(p => ({ p, questions }))
   }, ({ participant, questions) => ...)
   ```

   it is more explicit, but more verbose
   maybe then the 'fanout' name is not the best, maybe better would be to indicate that it spawns multiple tasks or something like that??

   ### another idea

   what if we would create a new dsl function that wraps 'step' (like 'branch')?
   naming ideas: `forEach`, `array`, `parallel`, `map`, `fanout` etc:

   ```ts
   .fanout({
     slug: 'send_surveys',
     dependsOn: ['participants', 'questions'],
     array: ({ participants, questions }, context) => participants.map(p => ({ p, questions }))
   }, ({ participant, questions) => ...)
   ```

   this way we can explicitely make them build input array and it is coupled to fanout, and 'step' is not polluted with any 'fanout' thingies
   those kind of steps are immediately visible versus fanout: true buried in the step step
   the array handler would just run as a ghost step __array__send_surveys
   alternative name for 'array': 'source'
   this way we have uniform handler signature everywhere, the array ghost step have the same as the handlers for normal steps, and the handler for fanout has the signature dictated by type of particular item in the array

   im also thinking, that maybe this 'array' ghost step is a more generic 'prepareTasksInput' or similar? 
   probably better to be explicit but maybe we will be needing this in future?
   or, maybe we will expose low level api for users to manually spawn their tasks in future?
   remember we are mvp but we plan to expand so must be safe to expand later but easy today

   i think at least this mechanic of preparing steps based on ghost step should be encoded in kind of agnostic way, probably should not be named 'fanout' in the SQL core but something more generic, and the DSL is only making it more semantic but under the hood uses generic mechanic

   imo any conditions or hooks should fire before this ghost step 'array'


3) the appendFanoutTask would be typed based on the type of a single item from the fanout array right? so it is compatible with the original items

we can infer the type of the array, so we can infer the type of the item, so we can type the method accordingly
manually appended data will not go through the 'array' ghost step of course

guard rails are great, emphasize that, those are really important

any caveats or potential issues with this manual appending?

5) for the check constraints, skip_condition? why not just skipped
what if fanout ghost step will fail? should it differ from the TS condition ghost step in the 'failure reason' or both be 'hook'?? why?
remember we can always add error_message with the failure_reason
rest is fine

7) does it really matter? wouldnt it be better to implement one with dependsOn and make singular an override? how much more work now vs in future? i want to batch similar work as it is easier to deliver together due to migrations and shit

8) ok but is 'is_ghost' a UI metadata or just a property of a step? where would we prefix with meta_ ?
skip separate table, but we need to make sure the meta is clearly defined - i would not put there anything that would be queried by SQL core pgflow.* methods, and would put there only stuff that is useful for the observatility UI later

9) if we set on having .fanout() with explicit 'array' ghost step, maybe it is just a nice pattern we should reuse and rely on it also in .branch(), making the input translation explicit, but optional. if not provided, inner flow must conform to this type of the input:

input: { run: { depA, depB, depC } }

as the deps are a new 'run' value right

maybe we can be more clever about the naming, so it is more explicit?
ideas: 'depsToRunInput', 'runInput', 'innerInput', 'branchInput', yeah bro, i think you nailed it with 'branchInput' - provide some suggestions similar to this one you gave, but i doubt you can beat it --- or maybe just 'input'? there is 'array' not 'fanoutArray', so maybe 'input' not 'branchInput' ---- not sure, review this
i would not make its signature different for signature for regular step, so it should also include the 'run' (outer) in case the inner flow would need to use it (it cannot reference outer run input, thats why user must explicitely provide it)

   ```ts
   .branch({
     slug: 'kyc',
     dependsOn: ['customer', 'rules'],
     input: ({ participants, questions }, context) => participants.map(p => ({ p, questions }))
   }, KycFlow) // or (input, context => ...)
   ```

   if 'input' handler is not provided, KycFlow must have following Flow Input:

```ts
type KycFlowInput = {
  customer: Customer
  rules: Rules
}
```

if inner flow have some other values required that are not provided in deps, like tenant_id, user is required to provide it via 'input' right?

13) perfect, make it explicit, emphasize that this keyword is reserved (like 'run')

14-15) yes makes sense, we just reuses the building blocks everywhere (steps and ghost steps)
