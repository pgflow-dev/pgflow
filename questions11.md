1. ok lets get back to queue|direct

2. i would like to simplify it for the callback-based inline steps, so the __prep for the branch would really be required
when you do not control the arguments of the flow (an embedded flow that was imported from other file)

```ts
type ExampleFlowInput = {
  user_id: string;
  tenant_id
}

.branch({
  slug: 'embeddedFlow',
  dependsOn: ['currentUser'],
  // here input is used to create a ExampleFlow-compatible input
  // remember, root steps of ExampleFlow have particular input type, which for all the steps is available under the input.run value
  // this is what root step of ExampleFlow will receive: { run: { user_id, tenant_id } }
  // wehn 
  input: ({ run, currentUser }) => ({ user_id: currentUser.id, tenant_id: run.tenant_id }),
}, ExampleFlow)
```

on the other hand, if user uses .branch() only to isolate few steps and bundle them together with single condition etc, input prep is optional

```ts
.branch({
  slug: 'inlineFlow',
  dependsOn: ['currentUser'],
  // here input is used to create a ExampleFlow-compatible input
  // remember, root steps of ExampleFlow have particular input type, which for all the steps is available under the input.run value
  // this is what root step of ExampleFlow will receive: { run: { user_id, tenant_id } }
  // wehn 
}, (branch) => {
  branch.step({ slug: 'inner_root' }, (input) => {
    // input == { run, currentUser }
    // exacly like a regular step below
  })
})
.step({ slug: 'regularStep', dependsOn: ['currentUser'] }, (input) => {
  // input == { run, currentUser }
})
```

does it make sense? is it clear enough? branches are pretending to be regular steps
but have the __prep step if they need to translate the regular step input (run+deps) into structure compatible with the imported flow,
which have already defined Flow input type

does it make sense?
i think i was overzealous with skipping the run, it does not really make sense??? 
or have i lost my way?

8. 
what is the point of prefixing with ::? i thought you will use it to prefix the branch slug to the inner steps only

i like onb::__gate, onb::__cond, onb::__prep, but onb::__prep_for__verify should really be onb::__prep_verify, and the onb__verify should be onb::verify

does it make it unambiguous?
