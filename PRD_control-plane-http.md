# PRD: ControlPlane HTTP Compilation (Phase 1)

**Status**: Draft
**Owner**: TBD
**Last Updated**: 2025-11-20

---

## What We're Building

**One-liner**: `pgflow compile` calls HTTP endpoint instead of spawning Deno runtime.

Replace CLI's fragile Deno runtime spawning with HTTP calls to a ControlPlane edge function. This:
- Eliminates deno.json complexity and path resolution bugs
- Establishes pattern for Phase 2 auto-compilation
- Improves developer experience with reliable compilation

**Alternatives considered**: Per-worker endpoints (code duplication), keep Deno spawning (too unreliable), direct SQL in CLI (wrong packaging model).

---

## Before & After

| Aspect | Old (v0.8.0) | New (v0.9.0) |
|--------|--------------|--------------|
| **Command** | `pgflow compile path/to/flow.ts --deno-json=deno.json` | `pgflow compile my-flow` |
| **How it works** | CLI spawns Deno → imports flow file → compiles to SQL | CLI calls HTTP → ControlPlane compiles → returns SQL |
| **Pain points** | Import map errors, path resolution, Deno version issues | Flow must be registered in ControlPlane first |
| **Setup** | Deno installed locally | Supabase + edge functions running |
| **Rollback** | N/A | `npx pgflow@0.8.0 compile path/to/flow.ts` |

---

## Goals & Success Criteria

**What success looks like:**
- ✅ ControlPlane pattern established (reusable for Phase 2)
- ✅ HTTP compilation works reliably (<5% users need version pinning)
- ✅ Developer setup simplified (no Deno version management)
- ✅ Clear error messages with rollback option
- ✅ `pgflow compile` uses HTTP (Deno spawn code deleted)
- ✅ `pgflow install` creates ControlPlane edge function
- ✅ Tests passing (80%+ coverage: unit, integration, E2E)
- ✅ Docs updated (installation, compilation, troubleshooting)
- ✅ Changelog complete

**Metrics:**
- Zero HTTP compilation failures
- Positive feedback on reliability
- ControlPlane API ready for Phase 2

---

## Requirements

### ControlPlane Edge Function
- Serve `GET /flows/:slug` → `{ flowSlug: string, sql: string[] }`
- Registry: `Map<slug, Flow>` built from flows array
- Validation: Reject duplicate slugs at startup
- Errors: 404 for unknown flows

### CLI Changes
- Command: `pgflow compile <flow-slug>` (flow slug, not file path)
- HTTP call: `GET /pgflow/flows/:slug`
- URL: Parse from `supabase status`
- Deprecation: Show warning if `--deno-json` used
- Migration: Delete all Deno spawn code

### Installation
`pgflow install` creates:
- `supabase/functions/pgflow/index.ts` - Calls `ControlPlane.serve(flows)`
- `supabase/functions/pgflow/flows.ts` - User edits, exports flow array
- `supabase/functions/pgflow/deno.json` - Minimal import map template
- Updates `supabase/config.toml` with edge function entry

### Testing
- **Unit**: ControlPlane registry, CLI helpers, mocked HTTP
- **Integration**: Real HTTP server, endpoint responses
- **E2E**: Full flow (install → register flow → compile), error scenarios
- **Coverage**: 80% min for new code, 100% for critical paths

### Out of Scope (Phase 2)
- ❌ Worker auto-compilation
- ❌ POST /ensure-compiled endpoint
- ❌ Shape comparison, advisory locks
- ❌ Import map auto-generation
- ❌ Flow auto-discovery

---

## Error Handling

All user-facing errors centralized here:

| Error Scenario | CLI Output | Fix |
|----------------|------------|-----|
| **--deno-json flag used** | Warning: `--deno-json` is deprecated and has no effect (will be removed in v1.0) | Remove flag |
| **Flow not registered** | Flow 'my-flow' not found. Did you add it to flows.ts? | Add to `flows.ts` |
| **Old path syntax** | Flow 'path/to/flow.ts' not found. Did you add it to flows.ts? | Use slug instead of path |
| **ControlPlane unreachable** | ControlPlane not reachable.<br><br>Fix options:<br>1. Start Supabase: `supabase start`<br>2. Start edge functions: `supabase functions serve`<br>3. Use previous version: `npx pgflow@0.8.0` | Start services or rollback |
| **SERVICE_ROLE missing** (v1.1) | SERVICE_ROLE key not found. Is Supabase running? (`supabase status`) | Check Supabase status |

---

## Documentation & Versioning

### Docs to Update
1. **installation.mdx**: Add note "Creates ControlPlane function for flow compilation"
2. **compile-flow.mdx**:
   - Remove Deno requirement (no longer user-facing)
   - Add prerequisites: Supabase + edge functions running
   - Update command examples (file path → slug)
   - Keep immutability note + link to delete-flows.mdx

### Versioning Strategy
- **Latest best practice**: Single-path documentation (v0.9.0+ only)
- **Escape hatch**: Version pinning (`npx pgflow@0.8.0`) for rollback
- **Optional (v1.1)**: Dedicated troubleshooting page if users request

### Phase 2 Changes
Move `compile-flow.mdx` to `concepts/` (tutorial → explanation), remove from getting started. User story: "Compilation is automatic now"

---

## Technical Design

### Architecture
```
pgflow compile my-flow
    │
    └─> HTTP GET /pgflow/flows/my-flow
        │
        ▼
    ControlPlane Edge Function
        │
        ├─> flows.get('my-flow')
        ├─> compileFlow(flow)  [reuses existing @pgflow/dsl]
        └─> { flowSlug: 'my-flow', sql: [...] }
        │
        ▼
    CLI generates migration: ${timestamp}_create_${flowSlug}_flow.sql
```

### Key Decisions
- **Reuse `compileFlow()`**: No new SQL logic, ControlPlane wraps existing DSL function
- **User owns flows.ts**: Import flows, export array
- **pgflow owns index.ts**: Updated via `pgflow install`
- **Future-proof**: `--control-plane` flag for multi-instance pattern (v1.1)

**See PLAN.md for**: API specs, code examples, detailed test plan, error patterns

---

## Constraints & Risks

### Dependencies
- Supabase CLI (any version with `supabase status`)
- Existing `compileFlow()` from @pgflow/dsl (no changes)
- nx monorepo structure

### Primary Risk: Import Map Complexity
**Risk**: deno.json management becomes worse
**Mitigation**: Minimal template, link to Supabase docs, users manage dependencies
**Detection**: Early testing with real flows
**Escape hatch**: Multiple ControlPlanes (manual)

### Constraints
- Zero breaking changes to output format
- 10-12 hours effort (implementation 4-5h, tests 6-7h)
- Ship v1.0 within 2 weeks

---

## Release Plan

### v1.0 (2 weeks)
- ControlPlane.serve() + `GET /flows/:slug`
- Replace `pgflow compile` with HTTP
- `pgflow install` creates edge function templates
- Tests (unit + integration + E2E)
- Docs updated
- Changelog

### v1.1 (1-2 weeks after v1.0, based on feedback)
- Troubleshooting page (if requested)
- SERVICE_ROLE auth (if not in v1.0)
- `--control-plane` flag
- Better error messages

---

## Appendix

### Related Documents
- **PLAN.md**: Detailed implementation, API specs, test plan
- **PLAN_orchestration.md**: Phase 2+ auto-compilation vision

### Changelog
- **2025-11-20**: Major simplification - removed duplication, centralized errors, streamlined structure
- **2025-11-20**: Clarified command signature (path → slug), deprecated --deno-json
- **2025-01-20**: Made troubleshooting page optional (v1.1)
- **2024-11-19**: Changed to `GET /flows/:slug` with `{ flowSlug, sql }` response
- **2024-11-19**: Initial PRD
