---
'@pgflow/dsl': minor
---

Add `.array()` method for type-safe array step creation

Introduces a new `.array()` method that provides compile-time type safety for array-returning handlers with zero runtime overhead.

- Enforces array return types at compile time
- Pure delegation to existing `.step()` method
- Full support for dependencies and runtime options
- Backward compatible

```typescript
flow.array({ slug: 'items' }, () => [1, 2, 3]);  // ✅ Valid
flow.array({ slug: 'invalid' }, () => 42);       // ❌ Compile error
```
