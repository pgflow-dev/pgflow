# PLAN: Auth Verification for Control Plane & Workers

**Created**: 2025-11-28
**Status**: Future Work
**Related**: PLAN_control-plane-edge-worker-compilation.md

---

## Goal

Control plane and workers verify the secret key to protect sensitive operations.

## Supabase Key Context

Supabase is transitioning from JWT-based keys to new API keys:

| Old Name | New Name | Format | Use Case |
|----------|----------|--------|----------|
| `anon` | publishable key | `sb_publishable_...` | Client-side (RLS-restricted) |
| `service_role` | secret key | `sb_secret_...` | Server-side (bypasses RLS) |

**Important notes:**
- **CLI/local dev** (`supabase start`): Only has legacy `anon`/`service_role` keys
- **Hosted Supabase**: Has both old and new key formats
- **Edge Functions**: Have `SUPABASE_SERVICE_ROLE_KEY` env var available by default
- **Timeline**: Legacy keys deprecated late 2026
- **Reference**: https://supabase.com/docs/guides/api/api-keys

**Supabase docs explicitly list "periodic jobs, queue processors, topic subscribers" as use cases for secret/service_role keys.**

---

## Why Auth is Required

Both pgflow functions need **service_role/secret key** protection:

| Function | Why Secret Key Required |
|----------|------------------------|
| **Control Plane** (`/pgflow/`) | Enumerate flows, compile flows - dangerous operations |
| **Workers** (`/greet-user-worker/`) | Full DB access, execute arbitrary handlers |

---

## Important: New Keys Require Manual Verification

From Supabase docs:
> "Edge Functions only support JWT verification via the anon and service_role JWT-based API keys. You will need to use the --no-verify-jwt option when using publishable and secret keys. Implement your own apikey-header authorization logic inside the Edge Function code itself."

**Key is sent in `apikey` header (NOT Authorization)** - new secret keys are not JWTs.

---

## Implementation

### Code Changes

**Files to modify:**
- `pkgs/edge-worker/src/ControlPlane.ts` (or equivalent)
- `pkgs/edge-worker/src/EdgeWorker.ts` (or equivalent)

**Implementation:**
```typescript
// At the start of request handling
const apiKey = req.headers.get('apikey');
const expectedKey = Deno.env.get('PGFLOW_SECRET_KEY'); // custom env var set by user

if (!apiKey || apiKey !== expectedKey) {
  return new Response(JSON.stringify({ error: 'Invalid or missing secret key' }), {
    status: 401,
  });
}
```

### User Setup Required

For production with new secret keys:
1. Create secret key in Supabase dashboard
2. Store as Edge Function secret: `PGFLOW_SECRET_KEY`
3. Pass same key to CLI: `pgflow compile --secret-key <key>`

### Documentation

**Add to docs:**
- Auth model explanation (both functions need service_role key)
- How to pass apikey header
- Production deployment considerations

**Example:**
```bash
curl http://localhost:54321/functions/v1/greet-user-worker \
  -H "apikey: $PGFLOW_SECRET_KEY"
```

---

## When to Implement

This should be implemented when:
- Flow enumeration is added to control plane
- Other sensitive operations are exposed
- Before production deployments become common

---

## References

- Supabase API Keys docs: https://supabase.com/docs/guides/api/api-keys
- Edge Function secrets: https://supabase.com/docs/guides/functions/secrets
