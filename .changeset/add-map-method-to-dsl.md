---
'@pgflow/dsl': minor
---

Add `.map()` method to Flow DSL for defining map-type steps

The new `.map()` method enables defining steps that process arrays element-by-element, complementing the existing SQL Core map infrastructure. Key features:

- **Root maps**: Process flow input arrays directly by omitting the `array` property
- **Dependent maps**: Process another step's array output using `array: 'stepSlug'`
- **Type-safe**: Enforces Json-compatible types with full TypeScript inference
- **Compile-time duplicate slug detection**: TypeScript now prevents duplicate step slugs at compile-time
- **Different handler signature**: Receives individual items `(item, context)` instead of full input object
- **Always returns arrays**: Return type is `HandlerReturnType[]`
- **SQL generation**: Correctly adds `step_type => 'map'` parameter to `pgflow.add_step()`

Example usage:

```typescript
// Root map - processes array input
new Flow<string[]>({ slug: 'process' }).map({ slug: 'uppercase' }, (item) =>
  item.toUpperCase()
);

// Dependent map - processes another step's output
new Flow<{}>({ slug: 'workflow' })
  .array({ slug: 'items' }, () => [1, 2, 3])
  .map({ slug: 'double', array: 'items' }, (n) => n * 2);
```
