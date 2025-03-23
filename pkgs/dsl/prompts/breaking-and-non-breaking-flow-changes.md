# Breaking vs. Non-Breaking Flow Changes: Implementation Guidelines

When working with the pgflow orchestration framework, understanding which changes to flows require a new `flow_slug` and which ones can be safely updated in-place is crucial for maintainability and reliability. This document provides comprehensive guidance on making this distinction and implementing changes correctly.

## Core Principles of Flow Versioning

1. **Flows are immutable once registered**: The graph structure and dependencies should not change for an existing flow_slug.
2. **Message compatibility**: When updating flows, consider whether existing in-flight messages would be compatible with the new flow structure.
3. **Graph shape integrity**: Changes that alter the graph's topology require a new `flow_slug`.

## Types of Changes

### Breaking Changes (Require New flow_slug)

Breaking changes affect the shape of the graph or the data flow between steps, making them incompatible with messages already in the queue for previous versions.

| Change Type | Example | Why Breaking |
|-------------|---------|--------------|
| Adding a step | Adding a new validation step | Changes graph topology |
| Removing a step | Removing a data processing step | Breaks existing dependencies |
| Changing step dependencies | Adding/removing a dependency between steps | Alters execution order and data flow |
| Changing step slug | Renaming `process` to `process_data` | Affects message routing |
| Changing step return type | Changing return from `string` to `{ value: string }` | Downstream steps expect different format |
| Changing input payload type | Adding required fields | In-flight messages lack newly required fields |
| Reordering steps (with different dependencies) | Changing execution sequence | Alters expected data flow |

### Non-Breaking Changes (Compatible with existing flow_slug)

Non-breaking changes don't alter the graph's structure or affect message compatibility, making them safe to update in-place.

| Change Type | Example | Why Non-Breaking |
|-------------|---------|------------------|
| Updating `maxAttempts` | Changing from 3 to 5 retries | Only affects execution behavior, not graph structure |
| Modifying `baseDelay` | Changing from 5s to 10s retry delay | Only affects timing, not data flow |
| Changing `timeout` value | Extending timeout from 30s to 60s | Only affects execution parameters |
| Optimizing step handler logic | Improving algorithm efficiency | Internal implementation detail |
| Adding optional fields to return type | Adding optional metadata | Doesn't break dependent steps |
| Updating documentation/comments | Adding explanation comments | No runtime impact |

## Implementation Best Practices

### When to Create a New Flow Version

1. **Explicit Versioning**: When making breaking changes, use either:
   - Semantic versioning: `analyze_website_v1.0.0` → `analyze_website_v1.1.0`
   - Date-based versioning: `analyze_website_20231001` → `analyze_website_20231115`

2. **Migration Strategy**: When introducing a new flow version:
   ```typescript
   // New version with breaking changes
   export const AnalyzeWebsiteV2 = new Flow<Input>({
     slug: 'analyze_website_v2', // Note the new slug
     maxAttempts: 3,
   })
   .step(/* updated step definitions */);
   
   // Keep old version for in-flight workflows
   export const AnalyzeWebsiteV1 = new Flow<Input>({
     slug: 'analyze_website_v1',
     maxAttempts: 3,
   })
   .step(/* original step definitions */);
   ```

3. **Transitioning to New Versions**:
   - Run both versions in parallel during transition
   - Direct new runs to new version
   - Allow old version to complete in-flight runs
   - Consider a formal deprecation period for old versions

### How to Safely Update Non-Breaking Changes

For runtime options like `maxAttempts`, `baseDelay`, or `timeout`:

```typescript
// Original flow with updated non-breaking parameters
export const AnalyzeWebsite = new Flow<Input>({
  slug: 'analyze_website',
  maxAttempts: 5,  // Updated from 3
  baseDelay: 10,   // Updated from 5
})
.step(
  { 
    slug: 'sentiment', 
    dependsOn: ['website'], 
    timeout: 60,   // Updated from 30
    maxAttempts: 7 // Updated from 5
  },
  async (input) => await analyzeSentiment(input.website.content)
);
```

### Runtime Options Handling

The implementation should separate runtime execution parameters from the flow structure definition:

```typescript
// Implementation pseudocode for flow registration system

function registerFlow(flow) {
  const existingFlow = getFlowFromDatabase(flow.flowOptions.slug);
  
  if (existingFlow) {
    // Check if graph shape is identical
    if (!areGraphShapesIdentical(existingFlow, flow)) {
      throw new Error(
        `Flow with slug "${flow.flowOptions.slug}" already exists with different shape. ` +
        `Use a new flow_slug for breaking changes.`
      );
    }
    
    // For non-breaking changes, update runtime options only
    updateFlowRuntimeOptions(
      flow.flowOptions.slug, 
      flow.flowOptions
    );
    
    // Update step-specific runtime options
    Object.entries(flow.getSteps()).forEach(([stepSlug, stepDefinition]) => {
      updateStepRuntimeOptions(
        flow.flowOptions.slug,
        stepSlug,
        {
          maxAttempts: stepDefinition.maxAttempts,
          baseDelay: stepDefinition.baseDelay,
          timeout: stepDefinition.timeout,
        }
      );
    });
    
    console.log(`Updated runtime options for flow "${flow.flowOptions.slug}"`);
  } else {
    // Register new flow with full definition
    createNewFlow(flow);
  }
}
```

## Technical Implementation Considerations

### 1. Flow Shape Comparison

To determine if a flow structure has changed (requiring a new slug):

```typescript
function areGraphShapesIdentical(flow1, flow2) {
  // Check if both flows have the same steps
  const steps1 = Object.keys(flow1.getSteps()).sort();
  const steps2 = Object.keys(flow2.getSteps()).sort();
  
  if (!arraysEqual(steps1, steps2)) return false;
  
  // Check if dependencies are identical for each step
  for (const stepSlug of steps1) {
    const deps1 = flow1.getSteps()[stepSlug].dependencies.sort();
    const deps2 = flow2.getSteps()[stepSlug].dependencies.sort();
    
    if (!arraysEqual(deps1, deps2)) return false;
  }
  
  return true;
}
```

### 2. Database Schema Support

The database schema should separate immutable flow structure from mutable runtime options:

```sql
-- Immutable flow structure (never changes for same flow_slug)
CREATE TABLE pgflow.flows (
  flow_slug TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pgflow.flow_steps (
  flow_slug TEXT REFERENCES pgflow.flows(flow_slug),
  step_slug TEXT NOT NULL,
  dependencies TEXT[] NOT NULL,
  PRIMARY KEY (flow_slug, step_slug)
);

-- Mutable runtime options (can be updated)
CREATE TABLE pgflow.flow_options (
  flow_slug TEXT REFERENCES pgflow.flows(flow_slug),
  max_attempts INTEGER,
  base_delay INTEGER,
  timeout INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (flow_slug)
);

CREATE TABLE pgflow.step_options (
  flow_slug TEXT,
  step_slug TEXT,
  max_attempts INTEGER,
  base_delay INTEGER,
  timeout INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (flow_slug, step_slug),
  FOREIGN KEY (flow_slug, step_slug) REFERENCES pgflow.flow_steps(flow_slug, step_slug)
);
```

### 3. CLI Support for Flow Diffing

Provide a CLI tool to help developers identify breaking vs. non-breaking changes:

```bash
# Example CLI usage
pgflow diff --current-flow analyze_website --new-flow-definition ./flows/analyze_website.ts

# Output:
# Breaking changes detected:
# - Step 'validate' added
# - Dependencies changed for step 'saveToDb' (added: 'validate')
# 
# Please create a new flow_slug to implement these changes.
```

## Workflow and Testing Recommendations

### Development Workflow

1. **Create a flow definition in TypeScript**
2. **Validate changes**:
   - Use the `pgflow diff` command to check if changes are breaking
   - For breaking changes, create a new flow version with updated slug
3. **Register the flow**:
   - In development, use `pgflow deploy --dev` for quick iteration
   - In production, follow proper migration processes

### Testing Strategy

1. **Unit test flow definitions** to verify graph structure
2. **Integration tests** to ensure compatible message passing between steps
3. **Version transition tests** to verify that both old and new versions run correctly during migration

### Monitoring Version Transitions

When transitioning between flow versions:

1. Monitor completion of in-flight executions of old versions
2. Track success rates of new flow versions
3. Implement alerting for flow execution failures
4. Consider a formal deprecation period before removing old versions

## Conclusion

By clearly separating breaking changes (requiring new flow slugs) from non-breaking updates (compatible with existing flow slugs), you can maintain a robust and reliable workflow orchestration system while still allowing for necessary evolution.

Remember these key principles:
- Changes to graph structure or data flow are breaking changes
- Runtime behavior adjustments are generally non-breaking
- Always verify compatibility before updating existing flows
- Use explicit versioning for breaking changes
- Document your versioning strategy for team alignment

Following these guidelines will help ensure that your workflow orchestration system remains stable, predictable, and maintainable as it evolves over time.
