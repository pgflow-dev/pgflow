## Design Goals

- Keep workers stateless and task-focused (only deal with tasks; call a few SQL RPCs).
- Push orchestration/state mutation into SQL.
- Keep the DSL declarative, minimal boilerplate, type-safe.

## Core Axes

### Task creation pattern

We need a `step_type` column on `steps` which will inform, how the new tasks should be spawned:

- `single` - one task per step (`task_index = 0`)
- `array` - one task per step that validates output is an array
  - Can be user-defined via `.array()` DSL method or generated as ghost step
  - Validates output and handles empty arrays based on `empty_array_mode`
- `map` - N tasks produced for a step
  - N is determined by dependency array step (either existing array step or generated ghost array step)
  - Each task receives array[task_index] as input
  - Step completes when all its tasks complete

### Queue-based task completion

Each step has a `queue` column that determines task completion:

`queue = 'queue_name'` means message is sent to specified queue and task is created in `queued` status.
`queue = NULL` means no message is queued and task is created in `started` status.

Workers poll only tasks from queues they're configured to handle.

`queue = NULL` tasks are meant to be manually completed/failed by a webhook, endpoint etc by calling a dedicated sql function (or `complete_task`).

Steps table stores the `queue` value to determine routing behavior.
Tasks inherit queue behavior from their step definition.

## Ghost steps

In order to support preprocessing steps, condition steps and also gate steps for the branches, we need to implement **Ghost Steps**. 
Ghost step is a step that is not created by a user, but is inserted by DSL as dependency to a user step.

Main purpose is to execute some preprocessing/condition logic implemented in TypeScript or provide a way to gate a branch by a JSON condition.

### Gate steps

Those are steps without a tasks that are used only to store JSON condition that is resolved by containment operator.
Those gates are useful because we can use JSON conditions to skip whole branches, and branches are just groups of steps with a branch prefix.
Gates does not have tasks becasue they never execute any code.
JSON condition decides if they are started or not.

#### Questions:

- when those gate steps should be completed? they should somehow be completed when started, so the dependent steps can be started immediately.
- this seems complicated and alternative is to copy-paste JSON condition to all root steps, but then, when we will run TS condition/prep? we want to run JSON condition matching as soon as possible to avoid any unnecessary work in case of a skip

### Condition steps

Those are the steps that are inserted as a dependency by the DSL compiler and their only purpose is to be executed before the original step is started. Like the error handler really is a condition callback that user provides for the step or a branch, right? So we are using the task mechanic in order to be able to execute some codes and get some results. The results should be interpreted as a Boolean. So if the results are falsy, we should skip the step and if results are true fee, we should complete the step. It all depends on the skip mode really but the return value from this task determines what happens if the task are skipped, et cetera.

### Preprocess steps

Those steps are also inserted by DSL compiler and they are a way to take original input for a step and to run user code to preprocess it and the return value would be used as a real input for a step. only for final steps and for the branches.

## Branch DSL

### Inline branch (callback)

* **`_prep` optional.**
* Inner steps behave like regular steps.
* **Input to inner roots:** `{ run, ...deps }` (outer run is included).
* You can still add a `__prep` if you want to reshape, but you don’t have to.

```ts
.branch({ slug: 'inlineFlow', dependsOn: ['currentUser'] }, (b) => {
  b.step({ slug: 'inner_root' }, (input) => {
    // input === { run, currentUser }
  });
});
.step({ slug: 'regularStep', dependsOn: ['currentUser'] }, (input) => {
  // input === { run, currentUser }
});
```

### Embedded branch (imported flow)

* **`__prep` is required.** Purpose: translate `{ run, ...deps }` into the **embedded flow’s `run`**.
* **Input to embedded roots:** `{ run: <return of branch.input> }`.

```ts
type ExampleFlowInput = { user_id: string; tenant_id: string };

.branch({
  slug: 'embeddedFlow',
  dependsOn: ['currentUser'],
  input: ({ run, currentUser }) => ({ user_id: currentUser.id, tenant_id: run.tenant_id }),
}, ExampleFlow);
```

This keeps inline branches “just like regular steps,” and embedded branches type-safe via required `input` mapping.

## Direct completion tasks & handlers

* If `queue=false` in DSL (resulting in `steps.queue=NULL`), the **handler is disallowed** and omitted. Compiler enforces this for both `step()` and `map()`.
* This works with `step_type='map'` too—multiple **direct** tasks to be completed via RPC/UI.

