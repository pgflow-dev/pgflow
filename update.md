# pgflow — Upcoming Changes (Finalized Plan)

This is the **agreed shape** for MVP + near-term features. It captures only what we explicitly settled on (or you stopped contesting), phrased for hand-off.

---

## Goals (unchanged)

* Keep workers **stateless** and **task-focused** (only deal with tasks; call a few SQL RPCs).
* Push orchestration/state mutation into **SQL**.
* Keep the DSL **declarative**, minimal boilerplate, type-safe.

---

## Core Axes

### 1) Task Creation Pattern — `step_type`

* `single`: one task (`task_index = 0`).
* `fanout`: **N** tasks produced for a step.

  * N is determined by a **preprocessor** node for that step (see `prep:Step` below).
  * Step completes when **all** its tasks complete.

### 2) How completion arrives — `route`

* `queue`: normal queue processing by workers.
* `direct`: tasks exist but **no queue message**; tasks are completed via API/UI.

  * If `route='direct'` for a step/fanout step ⇒ **no handler is allowed** for that step (compiler enforces).

*(Workers remain oblivious to branching/ghosts; they only process queued tasks.)*

---

## Ghosts, Slugs & Structure (final grammar)

We use two separators and a single kind marker:

* **Branch path separator:** `/`
  e.g. `A/B` means branch `B` nested under branch `A`.
* **Ghost kind marker on the last segment:** `gate:`, `cond:`, `prep:`
  e.g. `A/cond:B`, `A/prep:B`, `A/B/prep:Step`, `A/B/Step`.

**Rules**

* The **kind marker appears only on the last segment** (inner-most). Exactly **one** per slug.
* Branch-level ghosts: `…/gate:Branch`, `…/cond:Branch`, `…/prep:Branch`.
* Step-scoped fanout prep: `…/prep:Step`.
* Authored step: `…/Step` (no kind marker).
* No stacking (invalid: multiple kinds in one slug).

**Execution order inside a branch `P/B`**

1. `P/gate:B` — JSONB gate (**taskless**). If it skips, nothing under `P/B` runs.
2. `P/cond:B` — TS predicate (optional). Depends on `P/gate:B`.

   * `true` ⇒ skip; `false` ⇒ continue; throw ⇒ `condition_error`.
3. `P/prep:B` — branch input mapping (optional for inline; **required for embedded**). Depends on previous.
4. Inner nodes:

   * Per-step fanout prep: `P/B/prep:Step` (array for fanout), then
   * Authored step: `P/B/Step` (depends on its `prep:Step` if present, else on nearest upstream).

---

## Branching Semantics

* **Inline (callback) branch:** `prep:B` **optional**.
  If omitted, inner handlers receive **`{ run, ...deps }`** (same as regular step).
* **Embedded (imported) branch:** `prep:B` **required** and must return the embedded flow’s **`run`**.
  Inner roots receive **`{ run: <prep-return> }`**.
* JSON gating always lives on **`gate:B`** (taskless), not inside `prep`.

---

## Fanout

* Fanout is expressed by a **per-step preprocessor**: `…/prep:Step` must return an **array**.

  * If **non-array** is returned ⇒ fail `…/Step` with `preprocessing_error` and **do not** create tasks.
* The fanout step (`…/Step`, `step_type='fanout'`) creates tasks with `task_index = 0..N-1`.
* Works with both `route='queue'` and `route='direct'`.

---

## Appending Fanout Tasks (on-demand items)

* Allowed **only when the step is `started`** (enforced); disallowed after completion.
* New tasks:

  * `task_index = max(existing) + 1`.
  * `origin = 'appended'` (seeded tasks use `origin='array'`).
  * **Route must match the step’s route** (`queue` or `direct`).
* Operational tip: for “replace one item,” **append first**, then complete the old item with your domain “cancelled” payload, so the step never drops to zero remaining.

---

## Skip Model

* **Where:** JSON (on `gate:B`) and TS (on `cond:B`) only. Tasks have **no** skip/cancel semantics.
* **`skip_mode` (per step/branch):**

  * `propagate` (default): skipped nodes don’t produce output; downstream behaves accordingly.
  * `optional`: downstream input type reflects optional dependency (DSL typing).
  * `fail`: mark the node **failed** with `failure_reason='skipped'`.
* If skipped under `fail`, `status='failed'` and the run/branch updates accordingly.

---

## Failure Reasons

**Tasks**

* `failure_reason ∈ ('error','timeout')`.
* `error_message` free text.

**Steps**

* `failure_reason ∈ ('skipped','condition_error','preprocessing_error','task_error','task_timeout')`.

  * `condition_error`: `cond:B` threw.
  * `preprocessing_error`: any `prep:*` threw or fanout `prep:Step` returned non-array.
  * `task_error` / `task_timeout`: terminal aggregation from work tasks.
* `error_message` free text.
* No step-level “cancelled” reason (that’s domain-level payload).

---

## Output Step

* **Reserved slug:** `output`.
* It’s a **regular step**; for MVP it **depends on all leafs** (compiler wires it).
* Run’s final output = `output` step’s output (unnested).
  *(Custom `dependsOn` for `output` can be added later without breaking this.)*

---

## Pause & Cancel (run-level)

* **Pause (soft):** `paused_at`/`resumed_at` timestamps on runs; not a separate state.
  `start_ready_steps` is a no-op while paused; in-flight tasks continue.
* **Cancel:** `cancelled_at` timestamp; prevents new starts and fanout expansion.
  Completions don’t expand downstream. (No step/task “cancelled” reason.)

---

## Schema Notes (additive)

* **`steps`**

  * `step_type text check in ('single','fanout')`.
  * `default_route text check in ('queue','direct') default 'queue'`.
* **`step_tasks`**

  * `origin text check in ('array','appended') default 'array'`.
  * *(Tasks do not store skip/cond/prep metadata.)*
* **System slugs support** (compiler-emitted): allow `/` and `:` via a companion check (e.g., `is_system_slug`) and table check `is_valid_slug(step_slug) OR is_system_slug(step_slug)`.
  User-defined slugs remain strict.

---

## SQL Behavior (high-level)

* **`start_ready_steps`**

  * Respects paused/cancelled runs.
  * Evaluates `gate:*` JSON (taskless).
  * Runs `cond:*` (queued unless `direct`) and `prep:*` in order.
  * For `fanout`: uses `prep:Step` array to create tasks.
  * Enqueues messages **only** for `route='queue'`.
* **`start_tasks`**

  * Starts tasks **only** for queued messages; ignores `direct`.
* **Completion**

  * `complete_task` for queued tasks.
  * `complete_direct_task` (RPC) for direct tasks (naming aligned with `route='direct'`).
  * Step completion decrements `remaining_tasks`; when zero ⇒ fire deps; maybe complete run; archive message (if queued).

---

## DSL Surface (MVP)

* `flow.step({ slug, dependsOn?, route?, ... }, handler?)`

  * If `route='direct'` ⇒ **no handler**.
* `flow.fanout({ slug, dependsOn?, route?, array: (inputs) => any[] }, handler?)`

  * `array` compiles to `prep:Step`.
  * If `route='direct'` ⇒ **no handler**.
* `flow.branch({ slug, dependsOn?, input? }, EmbeddedFlow | (b) => { ... })`

  * **Embedded flow** ⇒ `input` **required**; compiles to `prep:Branch`.
  * **Inline callback** ⇒ `input` optional; inner steps get `{ run, ...deps }` if omitted.
* `flow.output(handler)`  *(reserved slug; compiler wires to all leafs for MVP)*
* **Append API** (client/SQL): append a fanout task to a `started` step; sets `origin='appended'`; validates route consistency.

---

## Observability (for now)

* No extra meta columns needed.
  The UI/view can parse:

  * **Branch path:** prefix before last `/`.
  * **Kind:** `gate|cond|prep|step` from the last segment.
  * **Target:** name after `:` when kind is `gate|cond|prep`.
* Virtual statuses (paused/cancelled) come from run timestamps.

---

## Future-ready (accepted direction, not for MVP)

* **Runner tags** (e.g., `'node'`, `'python'`, `'deno_strong'`):
  `steps.default_runner` and `tasks.runner` (messages include `runner`); workers filter `read_with_poll(..., conditional={"runner":"tag"})`.
  Orthogonal to `route`; requires only message shaping + worker filter; no change to core orchestration.
