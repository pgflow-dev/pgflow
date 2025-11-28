# PLAN: ControlPlane & Edge Worker Compilation Architecture

**Created**: 2025-11-23
**Status**: Design Complete
**Related**: PRD_control-plane-http.md

---

## Executive Summary

Replace fragile Deno runtime spawning with HTTP-based compilation via ControlPlane edge function. Workers import Flow classes directly and request compilation/verification from ControlPlane at startup. This establishes a clean separation of concerns and enables future orchestration capabilities.

---

## Core Architecture Decisions

### 1. ControlPlane Owns Compilation

**Decision**: All compilation happens through ControlPlane HTTP endpoints, not in workers or CLI.

**Rationale**:
- Single source of truth for compilation logic
- Advisory locks in one place
- Workers don't need DB write access
- Enables future orchestration features without changing worker API

**Implementation**:
```typescript
// ControlPlane serves HTTP endpoints
GET /flows/:slug → { flowSlug: string, sql: string[] }
POST /flows/:slug/ensure-compiled → { compiled: boolean }
POST /flows/:slug/verify-compiled → { compiled: boolean }
```

### 2. Workers Import Flow Classes Directly

**Decision**: Workers import TypeScript Flow classes, not flow slugs or configuration.

```typescript
import { PaymentFlow } from './flows/payment';
EdgeWorker.start(PaymentFlow);
```

**Rationale**:
- Type-safe at compile time
- Worker has shape for comparison
- No runtime discovery needed
- Clear dependency graph

### 3. ControlPlane as Thin HTTP Wrapper

**Decision**: ControlPlane is a minimal HTTP layer around existing `compileFlow()` function.

```typescript
// User's responsibility: provide all flows
ControlPlane.start([PaymentFlow, EmailFlow, RefundFlow]);

// ControlPlane just wraps compileFlow()
getFlow(slug) {
  return { flowSlug: slug, sql: compileFlow(flow) };
}
```

**Rationale**:
- Reuse existing compilation logic
- No new SQL generation code
- Simple to understand and test
- Can evolve without changing core logic

### 4. Two Compilation Modes

**Decision**: Different behavior for development vs production.

| Mode | Endpoint | Behavior |
|------|----------|----------|
| Development | `/ensure-compiled` | Auto-compile if missing or shape mismatch |
| Production | `/verify-compiled` | Fail if not pre-compiled or shape mismatch |

**Rationale**:
- Fast iteration in development
- Predictable deployments in production
- Clear failure modes
- Supports both workflows

### 5. Shape-Based Compilation Verification

**Decision**: Compare flow "shapes" to detect when recompilation needed.

```typescript
interface FlowShape {
  steps: string[];
  dependencies: Record<string, string[]>;
  stepTypes: Record<string, 'single' | 'map'>;
}

// Worker sends shape with request
POST /flows/:slug/ensure-compiled
{
  "shape": { ... },
  "mode": "development"
}
```

**Rationale**:
- Detect when TypeScript changes don't match DB
- Prevent drift between code and database
- Enable safe auto-recompilation in dev
- Hash optimization possible for performance

### 6. Queue Mapping in DSL

**Decision**: Flows declare their queues in TypeScript DSL.

```typescript
new Flow('payment-flow')
  .queue('payment-queue')  // Flow-level queue
  .step('validate', validateHandler)
    .queue('validation-queue')  // Step-level override
```

**Rationale**:
- Queue configuration lives with flow definition
- Type-safe queue assignment
- Supports both flow and step-level queues
- Natural for developers

### 7. One Worker, One Queue

**Decision**: Each worker instance polls exactly one queue.

```typescript
EdgeWorker.start(PaymentFlow, {
  queueName: 'payment-queue'  // Optional if flow defines it
});
```

**Rationale**:
- pgmq limitation (can't poll multiple queues efficiently)
- Simple mental model
- Clear worker specialization
- Predictable performance characteristics

### 8. User-Controlled Flow Organization

**Decision**: No restrictions on how users organize flow code.

```typescript
// All valid organizations:
import { PaymentFlow } from './flows';           // Local directory
import { PaymentFlow } from '@mycompany/flows';  // Shared package
import { PaymentFlow } from '../shared/flows';   // Relative import
```

**Constraint**: ControlPlane and workers must import identical flow definitions.

**Rationale**:
- Maximum flexibility
- Works with any build system
- No magic file discovery
- Explicit dependencies

---

## Implementation Roadmap

### Phase 1: Basic HTTP Compilation (Current PRD)

✅ Core functionality from PRD:
- ControlPlane edge function with GET /flows/:slug
- CLI uses HTTP instead of spawning Deno
- pgflow install creates edge function template

### Phase 2: Worker Compilation Integration

Worker startup compilation:
```typescript
class EdgeWorker {
  async start(FlowClass: typeof Flow) {
    const res = await fetch(`/flows/${FlowClass.slug}/ensure-compiled`, {
      method: 'POST',
      body: JSON.stringify({ shape: FlowClass.shape })
    });

    if (!res.ok) throw new Error('Flow not compiled');
    this.pollQueue();
  }
}
```

### Phase 3: Production Hardening

- Shape hash optimization for fast comparison
- Advisory locks in ControlPlane
- Proper error messages with actionable fixes
- Deployment mode detection (dev/prod)
- **Auth verification for ControlPlane endpoints** (see PLAN_auth-verification.md)
  - Verify `apikey` header against `PGFLOW_SECRET_KEY` env var
  - Required for production deployments
  - Protects flow enumeration and compilation endpoints

---

## Future Enhancements

### Near-term (Next 3 months)

#### 1. Hash-Based Shape Optimization
```typescript
function hashShape(shape: FlowShape): string {
  return crypto.createHash('sha256')
    .update(JSON.stringify(shape, Object.keys(shape).sort()))
    .digest('hex')
    .substring(0, 16);
}

// DB index for fast lookups
CREATE INDEX idx_flows_shape_hash ON pgflow.flows(shape_hash);
```

**Benefit**: O(1) shape comparison instead of full JSON comparison

#### 2. Batch Compilation Endpoint
```typescript
POST /flows/ensure-compiled-batch
{
  "flows": ["payment", "email", "refund"]
}
```

**Benefit**: Single round-trip for worker startup with multiple flows

#### 3. Multiple Flows per Worker
```typescript
EdgeWorker.start([PaymentFlow, RefundFlow], {
  queueName: 'finance-queue'  // All flows must share queue
});
```

**Benefit**: Better worker utilization, fewer worker instances

### Medium-term (6-12 months)

#### 4. Queue Topology Patterns

**Flow-Level Queues** (Simple):
```
payment-flow → payment-queue → payment-workers
```

**Domain-Level Queues** (Balanced):
```
[payment, refund] → finance-queue → finance-workers
```

**Step-Level Queues** (Advanced):
```
payment.validate → validation-queue → validation-workers
payment.charge   → payment-queue    → payment-workers
```

**Benefit**: Fine-grained resource allocation and scaling

#### 5. System Coordination APIs
```typescript
GET /system/compilation-status
GET /system/queue-mapping
GET /system/worker-status
POST /system/rebalance-queues
```

**Benefit**: Observability and dynamic optimization

#### 6. Compilation Caching
```typescript
class ControlPlane {
  private compilationCache = new Map<string, CompiledResult>();

  getFlow(slug: string) {
    const cacheKey = `${slug}:${this.getShapeHash(slug)}`;
    if (this.compilationCache.has(cacheKey)) {
      return this.compilationCache.get(cacheKey);
    }
    // Compile and cache...
  }
}
```

**Benefit**: Reduce repeated compilation overhead

### Long-term (12+ months)

#### 7. Multi-Version Support
```typescript
GET /v1/flows/:slug → { sql: string[] }           // Original
GET /v2/flows/:slug → { sql: string[], shape: Shape }  // Enhanced
GET /v3/flows/:slug → { sql: string[], shape: Shape, metadata: {...} }
```

**Benefit**: API evolution without breaking existing workers

#### 8. Advanced Compilation Strategies
```typescript
POST /flows/:slug/ensure-compiled?strategy=lazy     // Compile on-demand
POST /flows/:slug/ensure-compiled?strategy=eager    // Compile immediately
POST /flows/:slug/ensure-compiled?strategy=priority // Based on queue depth
```

**Benefit**: Optimize for different deployment scenarios

#### 9. Development Tooling
```typescript
GET /flows/:slug/debug           // Enhanced debugging info
POST /flows/:slug/dry-run        // Test without side effects
GET /flows/diff?from=prod&to=dev // Environment comparison
```

**Benefit**: Better developer experience and debugging

#### 10. Auto-Scaling Integration
```typescript
// ControlPlane monitors queue depth and worker load
POST /workers/scale
{
  "queue": "payment-queue",
  "reason": "queue_depth_high",
  "recommended_workers": 5
}
```

**Benefit**: Automatic scaling based on workload

---

## Design Principles

1. **Thin Layers**: Each component has a single, clear responsibility
2. **Type Safety**: TypeScript ensures compile-time correctness
3. **Progressive Enhancement**: Simple base with room to grow
4. **Fail Fast**: Clear error modes, especially in production
5. **No Magic**: Explicit imports and configuration
6. **Incremental Adoption**: Can start with one flow, add more over time

---

## Anti-Patterns to Avoid

❌ **Workers compiling directly to DB** - Violates separation of concerns
❌ **Auto-discovery of flows** - Too magical, hard to debug
❌ **Complex caching in workers** - State belongs in ControlPlane or DB
❌ **Different flow versions in same system** - Shape comparison prevents this
❌ **Synchronous compilation in request path** - Use async patterns

---

## Testing Strategy

### Unit Tests
- ControlPlane HTTP endpoints
- Shape hashing algorithm
- Compilation mode detection

### Integration Tests
- Worker → ControlPlane communication
- Shape mismatch detection
- Advisory lock behavior

### E2E Tests
- Full flow: Worker starts → Ensures compiled → Executes tasks
- Development mode: Auto-recompilation
- Production mode: Fail on missing compilation

---

## Migration Path

1. **v0.9.0**: Basic ControlPlane with CLI integration (Phase 1)
2. **v0.10.0**: Worker compilation integration (Phase 2)
3. **v0.11.0**: Production hardening (Phase 3)
4. **v1.0.0**: Stable API with hash optimization

Each version maintains backward compatibility with clear deprecation warnings.

---

## Appendix: Key Design Discussions

### Why ControlPlane Instead of Direct Worker Compilation?

- **Security**: Workers don't need DB write access
- **Consistency**: Single source of compilation logic
- **Evolution**: Can add features without changing workers
- **Testing**: Easier to mock HTTP than database

### Why Import Flow Classes Instead of Configuration?

- **Type Safety**: Compile-time verification
- **Simplicity**: No runtime discovery needed
- **Performance**: No parsing or validation overhead
- **Debugging**: Clear import graph in bundlers

### Why Separate Development and Production Modes?

- **Development**: Fast iteration, auto-compilation
- **Production**: Predictable, pre-compiled, fail-fast
- **Safety**: Can't accidentally auto-compile in production
- **Flexibility**: Same code, different deployment strategies

---

## References

- PRD_control-plane-http.md - Original requirements
- queue.md - Queue architecture design
- pkgs/dsl/src/compile-flow.ts - Compilation implementation
- pkgs/core/schemas/ - Database schema definitions