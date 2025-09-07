# Zod Schema Integration for pgflow

## Overview

This document outlines the gradual progression for integrating Zod schema validation into pgflow while maintaining the elegant type inference system and 3-layer architecture. The integration is designed to be **purely additive** - existing flows continue working unchanged while new flows can opt into schema validation.

## Design Principles

1. **Optional Enhancement**: Schemas are additive, never required
2. **Type System First**: TypeScript inference drives everything, schemas validate
3. **Worker-Side Validation**: Validation happens in the worker layer, not database
4. **Compile-Time Safety**: Schema/handler type mismatches caught at compile time
5. **Layer Separation**: DSL defines schemas, Worker validates, SQL Core orchestrates

## Phase 1: Foundation (Post-MVP)

### Goal: Basic Output Schema Support

Add optional output schema validation to existing `.step()` method.

#### DSL Changes
```typescript
// Current
.step({ slug: 'analyze' }, (input) => ({ score: 0.95 }))

// With optional schema
.step({ 
  slug: 'analyze',
  outputSchema: z.object({ score: z.number() })
}, (input) => ({ score: 0.95 }))
```

#### Implementation Details

**Type Constraint**: Handler return type must be assignable to schema type
```typescript
step<
  Slug extends string,
  THandler extends (input: StepInput, context: Context) => any,
  OutputSchema extends z.ZodSchema<AwaitedReturn<THandler>> | undefined = undefined,
  Deps extends Extract<keyof Steps, string> = never
>(
  opts: { 
    slug: Slug;
    dependsOn?: Deps[];
    outputSchema?: OutputSchema;
  } & StepRuntimeOptions,
  handler: THandler
): // ... return type unchanged
```

**Schema Compilation**: Convert Zod schemas to worker-readable format
```typescript
// At compile time
const stepDefinition = {
  slug: 'analyze',
  handler: compiledHandler,
  outputSchema: opts.outputSchema ? serializeZodSchema(opts.outputSchema) : undefined
};
```

**Worker Validation**: Pre-completion validation
```typescript
const result = await stepDef.handler(input, context);

if (stepDef.outputSchema) {
  const zodSchema = deserializeZodSchema(stepDef.outputSchema);
  const validation = zodSchema.safeParse(result);
  
  if (!validation.success) {
    return await pgflow.failTask(taskId, {
      failure_reason: 'schema_validation_error',
      error_details: validation.error.format()
    });
  }
  
  // Use validated/coerced data
  result = validation.data;
}

await pgflow.completeTask(taskId, result);
```

### Benefits
- Immediate validation benefits for new flows
- Rich error messages from Zod
- Type safety between handler and schema
- No database changes needed

## Phase 2: Array Schema Integration

### Goal: First-Class Array Schema Support

Enhance `.array()` method with `itemSchema` support.

#### DSL Enhancement
```typescript
// Current (.array() from MVP)
.array({ slug: 'items' }, (input) => [{ id: 1 }, { id: 2 }])

// With item schema
.array({ 
  slug: 'items',
  itemSchema: z.object({ id: z.number(), name: z.string().optional() })
}, (input) => [{ id: 1, name: 'Item 1' }, { id: 2 }])
```

#### Implementation Details

**Auto-Generate Output Schema**: `itemSchema` becomes `z.array(itemSchema)`
```typescript
array<
  Slug extends string,
  ItemSchema extends z.ZodSchema<any> | undefined = undefined,
  THandler extends (input: StepInput, context: Context) => Array<Json>
>(
  opts: {
    slug: Slug;
    dependsOn?: Deps[];
    itemSchema?: ItemSchema;
  } & StepRuntimeOptions,
  handler: THandler
): // ... return type with proper Array<ItemType>
{
  // Build full output schema from item schema
  const outputSchema = opts.itemSchema ? z.array(opts.itemSchema) : undefined;
  
  // Delegate to enhanced .step() method
  return this.step({
    ...opts,
    outputSchema
  }, handler);
}
```

**Map Step Integration**: Element type inference from array schema
```typescript
.map({
  slug: 'process',
  array: 'items',  // Type: Array<z.infer<typeof ItemSchema>>
  outputSchema: z.object({ processed: z.boolean() })
}, (item) => {
  // item: { id: number, name?: string }
  return { processed: true };
})
```

### Benefits
- Validates both array structure and element schemas
- Map steps get validated individual elements
- Clear separation between array generation and processing
- Type safety across array → map chains

## Phase 3: Input Schema Inference

### Goal: Schema-Driven Flow Input Types

Enable flow input type inference from Zod schemas.

#### DSL Enhancement
```typescript
// Current: Explicit type parameter
const flow = new Flow<{ url: string }>({ slug: 'analyze_website' });

// With schema inference
const inputSchema = z.object({ url: z.string().url() });
const flow = new Flow({ 
  slug: 'analyze_website',
  inputSchema
});
// Type automatically becomes: Flow<{ url: string }, ...>
```

#### Implementation Details

**Constructor Overload**: Support schema-based input inference
```typescript
// Type inference helper
type InferInput<T> = T extends { inputSchema: z.ZodSchema<infer U> } 
  ? U 
  : never;

// New constructor signature
constructor<Config extends { slug: string; inputSchema: z.ZodSchema<any> } & RuntimeOptions>(
  config: Config
): Flow<InferInput<Config>, BaseContext, EmptySteps, EmptyDeps>

// Original constructor still works
constructor<TInput extends AnyInput>(
  config: { slug: string } & RuntimeOptions
): Flow<TInput, BaseContext, EmptySteps, EmptyDeps>
```

**Runtime Input Validation**: Validate flow inputs when starting runs
```typescript
// At flow execution time
await pgflow.startFlow('analyze_website', inputData, {
  inputSchema: flow.inputSchema  // Optional validation
});
```

### Benefits
- DRY principle - define input shape once
- Runtime input validation when starting flows
- Better error messages for invalid flow inputs
- Consistent validation patterns across input/output

## Phase 4: Advanced Schema Features

### Goal: Complex Validation Patterns

Support advanced Zod features and custom validation patterns.

#### Schema Composition
```typescript
// Shared schemas across steps
const UserSchema = z.object({ id: z.string(), email: z.string().email() });
const ItemSchema = z.object({ id: z.string(), user_id: z.string() });

.array({ 
  slug: 'users',
  itemSchema: UserSchema
}, fetchUsers)

.array({ 
  slug: 'items',
  dependsOn: ['users'],
  itemSchema: ItemSchema
}, ({ users }) => fetchItemsForUsers(users))

.map({
  slug: 'enrich_items',
  array: 'items',
  outputSchema: ItemSchema.extend({ 
    user: UserSchema,
    enriched_at: z.date()
  })
}, enrichItem)
```

#### Conditional Schemas
```typescript
// Schema variations based on input
.step({
  slug: 'process',
  outputSchema: z.discriminatedUnion('type', [
    z.object({ type: z.literal('success'), data: z.unknown() }),
    z.object({ type: z.literal('error'), error: z.string() })
  ])
}, processData)
```

#### Transform and Coercion
```typescript
// Zod transforms applied during validation
.step({
  outputSchema: z.object({
    timestamp: z.string().transform(str => new Date(str)),
    count: z.string().transform(str => parseInt(str, 10))
  })
}, generateData)
```

### Benefits
- Rich validation with custom logic
- Data transformation during validation
- Type-safe discriminated unions
- Schema composition and reuse

## Implementation Strategy

### Schema Serialization Approaches

#### Option 1: JSON Schema Conversion
```typescript
// Compile time: Zod → JSON Schema
import { zodToJsonSchema } from 'zod-to-json-schema';

const jsonSchema = zodToJsonSchema(zodSchema);
// Store JSON Schema in step definition

// Runtime: JSON Schema → Zod (with limitations)
import { jsonSchemaToZod } from 'json-schema-to-zod';
const zodSchema = jsonSchemaToZod(jsonSchema);
```

**Pros**: Language agnostic, works with other tools  
**Cons**: Lossy conversion, limited Zod feature support

#### Option 2: Zod Schema Bundling
```typescript
// Include Zod schemas directly in worker bundle
const stepDefinition = {
  slug: 'analyze',
  handler: compiledHandler,
  outputSchema: opts.outputSchema  // Raw Zod schema
};
```

**Pros**: Full Zod feature support, no conversion loss  
**Cons**: Larger bundle size, TypeScript-specific

#### Recommended Approach
Start with **Option 2** for full feature support, add **Option 1** later for language interop if needed.

### Database Schema Changes

**Minimal Database Impact**: Store validation metadata without validation logic
```sql
-- Optional: Store schema metadata for debugging/tooling
ALTER TABLE pgflow.steps 
  ADD COLUMN has_input_schema BOOLEAN DEFAULT FALSE,
  ADD COLUMN has_output_schema BOOLEAN DEFAULT FALSE;

-- No actual schema storage in DB - keep it in worker bundle
```

### Migration Strategy

#### Phase 1 → 2 Migration
- Existing `.step()` calls unchanged
- New `.array({ itemSchema })` calls opt into validation
- Backward compatible

#### Phase 2 → 3 Migration  
- Existing `new Flow<Type>()` unchanged
- New `new Flow({ inputSchema })` enables input validation
- Constructor overloading maintains compatibility

#### Phase 3 → 4 Migration
- Existing schemas work unchanged
- New advanced features opt-in only
- No breaking changes to basic schema usage

## Error Handling Evolution

### Phase 1: Basic Validation Errors
```typescript
{
  failure_reason: 'schema_validation_error',
  error_details: {
    path: ['score'],
    message: 'Expected number, received string'
  }
}
```

### Phase 2: Structured Validation Reports
```typescript
{
  failure_reason: 'schema_validation_error',
  error_details: {
    schemaType: 'array',
    itemSchema: 'UserSchema',
    errors: [
      { path: [0, 'email'], message: 'Invalid email format' },
      { path: [2, 'id'], message: 'Required field missing' }
    ]
  }
}
```

### Phase 4: Rich Error Context
```typescript
{
  failure_reason: 'schema_validation_error',
  error_details: {
    input: { /* actual input data */ },
    output: { /* invalid output data */ },
    schema: { /* schema definition */ },
    validationErrors: { /* detailed Zod errors */ },
    suggestions: ['Check email format', 'Ensure ID is provided']
  }
}
```

## Testing Strategy

### Unit Tests
- Schema validation in isolation
- Type inference correctness
- Error message quality
- Schema serialization/deserialization

### Integration Tests  
- End-to-end flows with schemas
- Mixed flows (some steps with schemas, some without)
- Error propagation through chains
- Performance impact measurement

### Type Tests
```typescript
// Compile-time type checking
const flow = new Flow({ inputSchema: z.object({ url: z.string() }) })
  .array({ 
    itemSchema: z.object({ id: z.number() })
  }, handler);

type FlowInput = ExtractFlowInput<typeof flow>;
//   ^? Should be { url: string }

type ItemsOutput = StepOutput<typeof flow, 'items'>;  
//   ^? Should be Array<{ id: number }>
```

## Documentation Evolution

### Phase 1 Documentation
- Basic schema usage examples
- Migration guide from unvalidated flows
- Error handling patterns

### Phase 2 Documentation  
- Array processing with schemas
- Map/fanout validation patterns
- Type inference examples

### Phase 3 Documentation
- Input validation setup
- Flow design patterns with schemas
- Schema composition best practices

### Phase 4 Documentation
- Advanced validation cookbook
- Custom validation patterns
- Performance optimization guide

## Success Metrics

### Technical Metrics
- Zero breaking changes to existing flows
- Sub-100ms validation overhead for typical schemas
- 100% type safety preservation
- Schema serialization round-trip accuracy

### Developer Experience Metrics
- Reduced runtime validation errors in production
- Faster debugging with detailed error messages
- Improved IDE autocompletion with inferred types
- Simplified flow testing with schema-driven mocks

## Future Extensions

### OpenAPI Integration
- Generate OpenAPI specs from flow schemas
- API endpoint validation using flow input schemas

### Documentation Generation
- Auto-generate flow documentation from schemas
- Interactive schema browsers

### Schema Registry
- Centralized schema management across flows
- Schema versioning and evolution
- Cross-flow schema compatibility checking

### Multi-Language Support
- Generate schemas for other runtimes
- Cross-platform validation consistency

## Conclusion

The Zod schema integration follows pgflow's core principle of **optional complexity** - simple flows stay simple, complex flows get powerful validation tools. The gradual progression ensures each phase delivers immediate value while building toward comprehensive schema-driven development.

The key insight is keeping validation in the **worker layer** where it belongs, maintaining the clean separation between DSL (defines), Worker (validates), and SQL Core (orchestrates). This architectural decision makes the integration both powerful and maintainable.