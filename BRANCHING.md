# Branching

## Branching Semantics

* **Inline (callback) branch:** `prep:B` **optional**.
  If omitted, inner handlers receive **`{ run, ...deps }`** (same as regular step).
* **Embedded (imported) branch:** `prep:B` **required** and must return the embedded flow’s **`run`**.
  Inner roots receive **`{ run: <prep-return> }`**.
* JSON gating always lives on **`gate:B`** (taskless), not inside `prep`.

### Inline branch (callback)

- prepprocessing is optional
* Inner steps behave like regular steps.
* **Input to inner roots:** `{ run, ...deps }` (outer run is included).
* You can still add a preprocessing handler if you want to reshape, but you don’t have to.

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

* preprocessing step is required.** Purpose: translate `{ run, ...deps }` into the **embedded flow’s `run`**.
* **Input to embedded roots:** `{ run: <return of branch.input> }`.

```ts
type ExampleFlowInput = { user_id: string; tenant_id: string };

.branch({
  slug: 'embeddedFlow',
  dependsOn: ['currentUser'],
  // input: is a ghost preprocessing step, which will be just a regular step but prepended
  // as dependency to the embedded flow, with slug gen_prep_<branchSlug> 
  // it is "before" the branch" so it does not have the branchSlug__ prefix
  // the ExampleFlow root steps dependsOn are added to point to this prep step
  input: ({ run, currentUser }) => ({ user_id: currentUser.id, tenant_id: run.tenant_id }),
}, ExampleFlow);
```

This keeps inline branches “just like regular steps,” and embedded branches type-safe via required `input` mapping.
