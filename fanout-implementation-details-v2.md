# Fanout Implementation - Detailed File Changes (Declarative SQL Version)

## 1. Schema Changes

### Update: `pkgs/core/schemas/0050_tables_definitions.sql`
```sql
-- In the pgflow.steps table definition, add step_type column:
CREATE TABLE pgflow.steps (
    step_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID NOT NULL REFERENCES pgflow.flows(flow_id) ON DELETE CASCADE,
    flow_slug TEXT NOT NULL,
    slug TEXT NOT NULL,
    handler_name TEXT,
    step_index INT NOT NULL,
    deps_count INT NOT NULL DEFAULT 0,
    opt_max_attempts INT,
    opt_base_delay INTERVAL,
    opt_timeout INTERVAL,
    step_type TEXT NOT NULL DEFAULT 'single',  -- NEW COLUMN
    -- ... existing columns ...
    
    -- Add constraint for step_type
    CONSTRAINT step_type_check CHECK (step_type IN ('single', 'fanout'))
);
```

### Update: `pkgs/core/schemas/0060_tables_runtime.sql`
```sql
-- Remove or comment out this constraint to allow multiple tasks per step:
-- CONSTRAINT only_single_task_per_step CHECK (task_index = 0)
```

## 2. Function Updates

### Update: `pkgs/core/schemas/0100_function_add_step.sql`
```sql
CREATE OR REPLACE FUNCTION pgflow.add_step(
    p_flow_slug TEXT,
    p_slug TEXT,
    p_handler_name TEXT DEFAULT NULL,
    p_deps TEXT[] DEFAULT '{}',
    p_step_options pgflow.step_options DEFAULT NULL,
    p_step_type TEXT DEFAULT 'single'  -- NEW PARAMETER
) RETURNS VOID AS $$
DECLARE
    v_flow_id UUID;
    v_flow_options pgflow.step_options;
    v_step_index INT;
    v_step_id UUID;
BEGIN
    -- Validate fanout constraints
    IF p_step_type = 'fanout' THEN
        IF array_length(p_deps, 1) != 1 THEN
            RAISE EXCEPTION 'Fanout steps must have exactly one dependency';
        END IF;
        IF array_length(p_deps, 1) IS NULL THEN
            RAISE EXCEPTION 'Fanout steps cannot be root steps';
        END IF;
    END IF;

    -- ... existing flow lookup logic ...

    -- Modified INSERT to include step_type
    INSERT INTO pgflow.steps (
        flow_id, 
        flow_slug, 
        slug, 
        handler_name, 
        step_index,
        deps_count,
        opt_max_attempts,
        opt_base_delay,
        opt_timeout,
        step_type  -- NEW COLUMN
    ) VALUES (
        v_flow_id,
        p_flow_slug,
        p_slug,
        p_handler_name,
        v_step_index,
        array_length(p_deps, 1),
        COALESCE(p_step_options.max_attempts, v_flow_options.max_attempts, 3),
        COALESCE(p_step_options.base_delay, v_flow_options.base_delay, 'PT1S'::INTERVAL),
        COALESCE(p_step_options.timeout, v_flow_options.timeout, 'PT5M'::INTERVAL),
        p_step_type  -- NEW VALUE
    )
    -- ... rest remains the same ...
END;
$$ LANGUAGE plpgsql;
```

### Create: New file `pkgs/core/schemas/0100_function_spawn_fanout_tasks.sql`
```sql
-- Declarative function to spawn fanout tasks
CREATE OR REPLACE FUNCTION pgflow.spawn_fanout_tasks(
    p_run_id UUID,
    p_step_slug TEXT
) RETURNS VOID AS $$
WITH step_info AS (
    -- Get step and dependency info
    SELECT 
        s.step_id,
        s.flow_slug,
        d.dependency_slug,
        ss.step_state_id,
        sst.output AS dependency_output
    FROM pgflow.runs r
    JOIN pgflow.steps s ON s.flow_slug = r.flow_slug AND s.slug = p_step_slug
    JOIN pgflow.deps d ON d.step_id = s.step_id
    JOIN pgflow.step_states ss ON ss.run_id = r.run_id AND ss.step_slug = s.slug
    JOIN pgflow.step_states dep_ss ON dep_ss.run_id = r.run_id AND dep_ss.step_slug = d.dependency_slug
    JOIN pgflow.step_tasks sst ON sst.step_state_id = dep_ss.step_state_id AND sst.task_index = 0
    WHERE r.run_id = p_run_id
),
array_validation AS (
    -- Validate the dependency output is an array
    SELECT 
        CASE 
            WHEN jsonb_typeof(dependency_output) != 'array' THEN
                pgflow.raise_exception(format('Fanout dependency output must be an array, got %s', jsonb_typeof(dependency_output)))
            ELSE dependency_output
        END AS validated_output,
        jsonb_array_length(dependency_output) AS array_length,
        step_state_id,
        flow_slug
    FROM step_info
),
task_indices AS (
    -- Generate task indices
    SELECT generate_series(0, array_length - 1) AS task_index
    FROM array_validation
),
inserted_tasks AS (
    -- Insert all tasks in one batch
    INSERT INTO pgflow.step_tasks (
        step_state_id,
        task_index,
        status,
        attempts_count
    )
    SELECT
        av.step_state_id,
        ti.task_index,
        'queued',
        0
    FROM array_validation av
    CROSS JOIN task_indices ti
    RETURNING task_index
),
-- Update remaining_tasks count
update_state AS (
    UPDATE pgflow.step_states
    SET remaining_tasks = av.array_length
    FROM array_validation av
    WHERE step_states.step_state_id = av.step_state_id
)
-- Send all messages in one batch
SELECT pgmq.send_batch(
    'pgflow-tasks',
    ARRAY(
        SELECT jsonb_build_object(
            'run_id', p_run_id,
            'flow_slug', av.flow_slug,
            'step_slug', p_step_slug,
            'task_index', ti.task_index
        )
        FROM array_validation av
        CROSS JOIN task_indices ti
    )
);
$$ LANGUAGE sql;
```

### Update: `pkgs/core/schemas/0090_function_poll_for_tasks.sql`
In the main CTE query, modify the task_payload construction:
```sql
-- Add step type info to the query
WITH task_messages AS (
    -- ... existing CTEs ...
),
task_with_step_info AS (
    SELECT 
        t.*,
        s.step_type,
        -- For fanout steps, get the single dependency slug
        CASE 
            WHEN s.step_type = 'fanout' THEN 
                (SELECT d.dependency_slug FROM pgflow.deps d WHERE d.step_id = s.step_id LIMIT 1)
            ELSE NULL
        END AS fanout_dep_slug
    FROM task_messages t
    JOIN pgflow.steps s ON s.flow_slug = t.flow_slug AND s.slug = t.step_slug
)
-- In the final SELECT, modify input construction:
SELECT
    msg_id,
    read_ct,
    enqueued_at,
    vt,
    json_build_object(
        'task_id', task_id::text,
        'run_id', run_id::text,
        'flow_slug', flow_slug,
        'step_slug', step_slug,
        'task_index', task_index,
        'input', 
        CASE 
            WHEN step_type = 'fanout' THEN
                -- For fanout: only send the specific array item
                jsonb_build_object(
                    'item', 
                    (agg.deps_output -> fanout_dep_slug) -> task_index
                )
            ELSE
                -- For single: current behavior
                jsonb_build_object(
                    'run', r.input,
                    'deps', agg.deps_output
                )
        END
    ) AS task_payload
FROM task_with_step_info t
JOIN pgflow.runs r ON r.run_id = t.run_id
-- ... rest of joins remain the same
```

### Update: `pkgs/core/schemas/0100_function_start_ready_steps.sql`
Replace the procedural approach with declarative CTEs:
```sql
CREATE OR REPLACE FUNCTION pgflow.start_ready_steps(
    p_run_id UUID
) RETURNS VOID AS $$
WITH ready_steps AS (
    -- Find and update ready steps
    UPDATE pgflow.step_states ss
    SET 
        status = 'started',
        started_at = clock_timestamp()
    FROM pgflow.runs r
    WHERE ss.run_id = p_run_id
        AND ss.run_id = r.run_id
        AND ss.status = 'created'
        AND ss.remaining_deps = 0
    RETURNING 
        ss.step_state_id, 
        ss.step_slug, 
        r.flow_slug
),
step_details AS (
    -- Get step type for each ready step
    SELECT 
        rs.*,
        s.step_type
    FROM ready_steps rs
    JOIN pgflow.steps s ON s.flow_slug = rs.flow_slug AND s.slug = rs.step_slug
),
-- Handle single-type steps
single_tasks AS (
    INSERT INTO pgflow.step_tasks (
        step_state_id,
        task_index,
        status,
        attempts_count
    )
    SELECT
        sd.step_state_id,
        0,
        'queued',
        0
    FROM step_details sd
    WHERE sd.step_type = 'single'
    RETURNING step_state_id
),
single_messages AS (
    SELECT pgmq.send_batch(
        'pgflow-tasks',
        ARRAY(
            SELECT jsonb_build_object(
                'run_id', p_run_id,
                'flow_slug', sd.flow_slug,
                'step_slug', sd.step_slug,
                'task_index', 0
            )
            FROM step_details sd
            WHERE sd.step_type = 'single'
        )
    )
),
-- Handle fanout-type steps
fanout_spawns AS (
    SELECT pgflow.spawn_fanout_tasks(p_run_id, sd.step_slug)
    FROM step_details sd
    WHERE sd.step_type = 'fanout'
)
SELECT 1; -- Function must return something
$$ LANGUAGE sql;
```

### Update: `pkgs/core/schemas/0100_function_complete_task.sql`
Add fanout aggregation logic:
```sql
-- After marking task as completed, add this logic:

-- Aggregate fanout outputs when all tasks complete
WITH fanout_check AS (
    SELECT 
        s.step_type,
        ss.step_state_id,
        ss.remaining_tasks
    FROM pgflow.step_states ss
    JOIN pgflow.steps s ON s.flow_slug = v_flow_slug AND s.slug = v_step_slug
    WHERE ss.step_state_id = v_step_state_id
        AND s.step_type = 'fanout'
        AND ss.remaining_tasks = 0
),
fanout_aggregation AS (
    UPDATE pgflow.step_states ss
    SET output = (
        SELECT jsonb_agg(st.output ORDER BY st.task_index)
        FROM pgflow.step_tasks st
        WHERE st.step_state_id = fc.step_state_id
            AND st.status = 'completed'
    )
    FROM fanout_check fc
    WHERE ss.step_state_id = fc.step_state_id
)
-- Continue with normal completion logic
```

### Add: Helper function for raising exceptions in SQL
```sql
-- Add to 0030_utilities.sql
CREATE OR REPLACE FUNCTION pgflow.raise_exception(message TEXT)
RETURNS VOID AS $$
BEGIN
    RAISE EXCEPTION '%', message;
END;
$$ LANGUAGE plpgsql;
```

## 3. TypeScript DSL Updates

### Update: `pkgs/dsl/src/dsl.ts`

```typescript
// Add to interfaces
export interface StepOptions {
  slug: string;
  dependsOn?: string[];
  fanout?: boolean;  // NEW
  maxAttempts?: number;
  baseDelaySeconds?: number;
  timeoutSeconds?: number;
}

// Add to StepDefinition interface
export interface StepDefinition<TOutput extends Json> {
  slug: string;
  handler?: StepHandler<TOutput>;
  dependencies: string[];
  options: Partial<RuntimeOptions>;
  fanout?: boolean;  // NEW
}

// Type helpers for fanout
type IsArray<T> = T extends readonly (infer U)[] ? U : never;

type FanoutInput<TItem extends Json> = {
  item: TItem;
};

// Update StepInput type to handle fanout
type StepInput<
  TFlow extends Flow<any, any, any>,
  TOptions extends StepOptions
> = TOptions['fanout'] extends true
  ? TOptions['dependsOn'] extends readonly [infer DepSlug extends string]
    ? IsArray<StepOutput<TFlow, DepSlug>> extends never
      ? never
      : FanoutInput<IsArray<StepOutput<TFlow, DepSlug>>>
    : never
  : {
      run: FlowInput<TFlow>;
      deps: StepDependencies<TFlow, TOptions['dependsOn']>;
    };

// Add validation type
type ValidateFanoutOptions<
  TOptions extends StepOptions,
  TFlow extends Flow<any, any, any>
> = TOptions['fanout'] extends true
  ? TOptions['dependsOn'] extends readonly [infer Single extends string]
    ? StepOutput<TFlow, Single> extends Json[]
      ? unknown
      : 'Fanout step dependency must return an array'
    : 'Fanout steps must have exactly one dependency'
  : unknown;

// Update Flow.step method
step<
  TSlug extends string,
  TOptions extends StepOptions & { slug: TSlug },
  TOutput extends Json
>(
  options: TOptions & ValidateFanoutOptions<TOptions, this>,
  handler: (input: StepInput<this, TOptions>) => TOutput | Promise<TOutput>
): Flow<...> {
  // Runtime validation
  if (options.fanout) {
    if (!options.dependsOn || options.dependsOn.length !== 1) {
      throw new Error('Fanout steps must have exactly one dependency');
    }
  }
  
  // Store step with fanout flag
  const stepDef: StepDefinition<TOutput> = {
    slug: options.slug,
    handler: handler as StepHandler<Json>,
    dependencies: options.dependsOn || [],
    options: {
      maxAttempts: options.maxAttempts,
      baseDelaySeconds: options.baseDelaySeconds,
      timeoutSeconds: options.timeoutSeconds,
    },
    fanout: options.fanout,  // NEW
  };
  
  // ... rest of method remains the same
}
```

### Update: `pkgs/dsl/src/compile-flow.ts`
```typescript
function compileStep(
  flowSlug: string,
  step: StepDefinition<Json>,
  index: number
): string {
  const params = [
    `flow_slug => '${escapeString(flowSlug)}'`,
    `slug => '${escapeString(step.slug)}'`,
  ];

  if (step.handler) {
    params.push(`handler_name => '${escapeString(step.handler.name)}'`);
  }

  if (step.dependencies.length > 0) {
    const depsArray = step.dependencies.map(d => `'${escapeString(d)}'`).join(', ');
    params.push(`deps => ARRAY[${depsArray}]`);
  }

  const runtimeOptions = formatRuntimeOptions(step.options);
  if (runtimeOptions) {
    params.push(`step_options => ${runtimeOptions}`);
  }

  // Add step_type parameter for fanout steps
  if (step.fanout) {
    params.push(`step_type => 'fanout'`);
  }

  return `SELECT pgflow.add_step(${params.join(', ')});`;
}
```

## 4. Example Usage

```typescript
// Example flow showing fanout pattern
export const analyzeWebsitesFlow = new Flow({
  slug: 'analyze-websites',
})
  // Prepare step that returns an array
  .step(
    { slug: 'prepare-urls', dependsOn: [] },
    async ({ run }) => {
      return [
        { url: 'https://example.com', id: 1 },
        { url: 'https://test.com', id: 2 },
        { url: 'https://demo.com', id: 3 },
      ];
    }
  )
  // Fanout step processes each item
  .step(
    { 
      slug: 'analyze-site', 
      dependsOn: ['prepare-urls'], 
      fanout: true 
    },
    async ({ item }) => {
      // item is typed as { url: string, id: number }
      console.log(`Analyzing ${item.url}`);
      return { 
        id: item.id,
        url: item.url,
        title: `Title of ${item.url}`,
        wordCount: Math.floor(Math.random() * 1000)
      };
    }
  )
  // Aggregate results
  .step(
    { slug: 'summarize', dependsOn: ['analyze-site'] },
    async ({ deps }) => {
      // deps['analyze-site'] is an array of all results
      const totalWords = deps['analyze-site'].reduce(
        (sum, site) => sum + site.wordCount, 
        0
      );
      return { 
        sitesAnalyzed: deps['analyze-site'].length,
        totalWords 
      };
    }
  );
```