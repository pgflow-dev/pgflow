# Organize Roadmap

Sequence features and define cross-feature constraints in roadmap.md.

## Purpose

roadmap.md is the single source of truth for:
- Implementation order
- Why features are sequenced this way
- What blocks what
- Cross-feature concerns

## Roadmap Structure

```markdown
# pgflow Roadmap

## Active Development

1. **Feature Name** ([features/feature-name.md](features/feature-name.md))
   - Brief context: why this is first
   - Blocks: Feature X, Feature Y
   - Breaking change - needs doc updates

2. **Another Feature** ([features/another.md](features/another.md))
   - Can parallelize with #1 (independent)
   - Enables: Future work Z
   - Common customer request

## Upcoming (Sequenced)

3. **Next Feature** ([features/next.md](features/next.md))
   - Depends on: #1, #2 completed
   - High value but complex

## Under Consideration

See [brewing/](brewing/) for ideas being explored:
- Idea A (waiting for customer validation)
- Idea B (needs more design work)

## Completed

- ✅ **Old Feature** (shipped 2025-01-15) - Brief description

## Cross-Feature Constraints

- Feature A → blocks → Features B, C, D
- Breaking changes should bundle: Feature X + Feature Y
- Feature Z requires external dependency (library update)
```

## When to Update Roadmap

Update roadmap.md when:
- New feature spec created in features/
- Dependencies change
- Priority shifts (reorder)
- Feature completes (move to Completed)
- Cross-cutting concern discovered

## Steps

### 1. Add new feature

```markdown
## Active Development

...

3. **New Feature** ([features/new-feature.md](features/new-feature.md))
   - Brief context about why/when
   - Depends on: Feature X
   - Blocks: Feature Y
```

### 2. Reorder if needed

Renumber to reflect new sequence. Consider:
- Dependencies (A must complete before B)
- Parallelization (can A and B run simultaneously?)
- Breaking changes (bundle together)
- Customer urgency
- Foundational work first

### 3. Update constraints

Add to "Cross-Feature Constraints" section if:
- Multiple features affected by single decision
- Breaking changes that should be bundled
- External dependencies

### 4. Commit

```bash
git -C "$notes" add roadmap.md
git -C "$notes" commit -m "Update: roadmap reordering (moved X before Y)"
```

## Key Principles

- **Minimal**: Just sequence and context, not implementation details
- **Explicit links**: Use `[features/foo.md](features/foo.md)` format
- **Context bullets**: Why this order? What does it unblock?
- **Keep updated**: Roadmap should always reflect current thinking
- **Numbered**: Active work is numbered, upcoming is numbered, brewing is not

## Example Reordering

Before:
```markdown
1. Feature A (no dependencies)
2. Feature B (depends on A)
3. Feature C (no dependencies)
```

After (C is urgent):
```markdown
1. Feature C (no dependencies) - URGENT: customer blocker
2. Feature A (can parallelize with C)
3. Feature B (depends on A)
```

Git commit:
```bash
git -C "$notes" add roadmap.md
git -C "$notes" commit -m "Update: prioritize Feature C (customer blocker)"
```

## Marking Complete

When feature ships:

```markdown
## Completed

- ✅ **Feature Name** (shipped 2025-02-15) - Brief outcome
```

Remove from Active/Upcoming sections.

## Archive Strategy

Archive strategy is TBD. For now:
- Keep completed items in roadmap.md
- When file gets large, decide on archive approach
- Might snapshot roadmap monthly or move old completed items
