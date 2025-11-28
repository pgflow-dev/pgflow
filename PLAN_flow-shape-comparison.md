# Flow Shape Comparison Plan

## Overview

A hybrid approach for verifying that a TypeScript Flow definition matches what's stored in the database, designed to start simple with a clear path to optimization.

## Core Decisions

### What is "Shape"?

The shape of a flow includes:
- Flow slug
- Step slugs and their execution order (`step_index`)
- Step types (`single` or `map`)
- Dependencies between steps

The shape explicitly **excludes**:
- Runtime options (`opt_*` fields in database)
- Timeout, retry, and delay settings
- Any configuration that can change during the flow's lifetime

### Architecture

1. **TypeScript utility** (`getFlowShape`) - Extracts structural shape from Flow instance
2. **Shape representation** - Normalized JSON structure
3. **PostgreSQL function** (`pgflow.verify_flow_shape`) - Compares provided shape against database

### Implementation Approach

- **Hybrid strategy**: Simple comparison now, hash-ready for future optimization
- **Separate utility**: Standalone function, not a method on Flow class
- **Edge worker flow**: Worker computes shape client-side, sends to DB for verification
- **Simple return**: PostgreSQL function returns boolean only

## Shape Representation

```typescript
interface FlowShape {
  slug: string;
  steps: Array<{
    slug: string;
    index: number;
    type: 'single' | 'map';
    dependencies: string[]; // sorted alphabetically
  }>; // sorted by index

  // Future additions (when introduced):
  inputSchema?: object;  // JSON Schema for flow input
  outputSchema?: object; // JSON Schema for flow output
}
```

### Determinism Rules

- Steps sorted by `step_index`
- Dependencies sorted alphabetically
- All arrays have consistent ordering
- Optional fields omitted when undefined (not null)

## Implementation Phases

### Phase 1: Simple Comparison (MVP)

**TypeScript** (`pkgs/dsl/src/utils/getFlowShape.ts`):
```typescript
export function getFlowShape(flow: Flow): FlowShape {
  // Extract shape, sort deterministically
  // Exclude all opt_* properties
}
```

**PostgreSQL** (`pgflow.verify_flow_shape`):
```sql
CREATE FUNCTION pgflow.verify_flow_shape(shape jsonb)
RETURNS boolean AS $$
  -- Build shape from pgflow.flows, steps, deps
  -- Compare with provided shape
  -- Return true/false
$$ LANGUAGE plpgsql;
```

**Usage**:
```typescript
const shape = getFlowShape(flow);
const isCompiled = await supabase.rpc('verify_flow_shape', { shape });
```

### Phase 2: Client-Side Hashing (If Needed)

Add hashing without changing interfaces:
```typescript
export function getFlowShapeHash(flow: Flow): string {
  const shape = getFlowShape(flow);
  return createHash('sha256').update(JSON.stringify(shape)).digest('hex');
}
```

Database can store `shape_hash` in `pgflow.flows` for quick comparison.

### Phase 3: Server-Side Hashing (If Needed)

Add PostgreSQL function:
```sql
CREATE FUNCTION pgflow.compute_flow_shape_hash(flow_slug text)
RETURNS text AS $$
  -- Compute hash from database records
$$ LANGUAGE plpgsql;
```

Enables server-side hash generation for drift detection.

## Future Enhancements

### Schema Support

When input/output schemas are added:
- Add `inputSchema` and `outputSchema` to FlowShape interface
- Old flows without schemas still work (undefined === undefined)
- Mixed schemas trigger recompilation (as expected)
- No explicit versioning needed - users create new flow slugs (e.g., `my-flow-v2`)

### Queue Spreading

When flows can target different queues:
- Add `queueName` or similar to FlowShape
- Follows same pattern as schemas

### Rule-Based Exclusions

Consider adding configuration for what to exclude from shape:
```typescript
interface ShapeOptions {
  excludePatterns?: string[]; // e.g., ['opt_*', 'retry_*']
  includeSchemas?: boolean;
}
```

## Development Guidelines

### Do's
- Keep shape representation stable and backwards-compatible
- Sort all arrays deterministically
- Use undefined (not null) for missing optional fields
- Test with flows of varying complexity

### Don'ts
- Don't include runtime configuration in shape
- Don't break existing shape format when adding features
- Don't optimize prematurely - wait for real performance needs
- Don't add fields that might change during flow lifetime

## Testing Strategy

1. **Unit tests** for `getFlowShape`:
   - Same flow produces same shape
   - Different structures produce different shapes
   - Runtime options don't affect shape
   - Deterministic ordering

2. **Integration tests** for `verify_flow_shape`:
   - Matches when TypeScript and DB are in sync
   - Fails when steps are added/removed
   - Fails when dependencies change
   - Ignores runtime option changes

3. **End-to-end tests**:
   - Compile flow → verify shape → returns true
   - Modify flow → verify shape → returns false
   - Recompile → verify shape → returns true again

## Migration Path

For existing flows when this feature is added:
1. No migration needed - feature is additive
2. Existing flows can opt-in by using the verification
3. Future flows get verification by default in edge worker

## Open Questions

- Should we cache shape computation results?
- Should shape comparison be part of `pgflow compile` output?
- How to communicate shape mismatch errors to developers?

## Success Criteria

- Zero false positives (never says shapes differ when they're the same)
- Zero false negatives (never says shapes match when they're different)
- Sub-10ms verification time for typical flows (<50 steps)
- Clear upgrade path to hashing without breaking changes