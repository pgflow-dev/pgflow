# Plan: Complete pgmq 1.5.0+ Upgrade Documentation and Communication

## Completed Tasks

✅ Core migration changes with compatibility check
✅ Updated `set_vt_batch` to use RETURNS TABLE (future-proof)
✅ Added optional `headers` field to TypeScript `PgmqMessageRecord`
✅ Updated all test mock messages
✅ Created changeset with breaking change warning
✅ Manual testing verified migration fails gracefully on pgmq 1.4.4

## Remaining Tasks

### 1. Create News Article

**File:** `pkgs/website/src/content/docs/news/pgmq-1-5-0-upgrade.mdx` (or similar)

Create a news article announcing:
- pgflow 0.8.0 requires pgmq 1.5.0+
- Breaking change details
- Migration instructions
- Benefits of the upgrade (future-proofing against pgmq changes)

### 2. Update Supabase CLI Version Requirements in Docs

**Files to review and update:**
- `pkgs/website/src/content/docs/get-started/installation.mdx`
- Other getting started guides
- Any tutorial pages mentioning Supabase CLI version

**Action:** Update minimum Supabase CLI version requirement to the version that includes pgmq 1.5.0+

### 3. Update READMEs

**Files to review and update:**
- Root `README.md`
- `pkgs/core/README.md`
- `pkgs/edge-worker/README.md`
- `pkgs/cli/README.md`
- Any other package READMEs mentioning Supabase versions

**Action:** Ensure all READMEs mention the pgmq 1.5.0+ requirement

### 4. Improve Update pgflow Docs Page

**File:** Look for existing update/upgrade documentation page

**Actions:**
- Add section about breaking changes in 0.8.0
- Document migration path from 0.7.x to 0.8.0
- Include pgmq version check instructions
- Add troubleshooting section for migration failures

### 5. Review All Docs Pages for Version References

**Action:** Comprehensive audit of all documentation for:
- Outdated Supabase CLI version numbers
- Missing pgmq version requirements
- Installation/setup instructions that need updating
- Migration guides that need breaking change warnings

**Files to check:**
- All files in `pkgs/website/src/content/docs/`
- All READMEs across packages
- Any deployment guides
- Troubleshooting pages

## Testing Checklist

After documentation updates:
- [ ] Build website locally and verify all pages render correctly
- [ ] Check all internal links still work
- [ ] Verify code examples are still accurate
- [ ] Review for consistency in version numbering

## Notes

- Keep documentation aligned with MVP philosophy (concise, clear, actionable)
- Follow Diataxis framework for documentation organization
- Use clear warnings for breaking changes
- Provide migration instructions, not just "upgrade"
