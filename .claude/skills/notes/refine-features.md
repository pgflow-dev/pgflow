# Refine to Features

Create implementation-ready specs from brewing ideas.

## Purpose

Features folder contains detailed, implementation-ready specifications. Each file is a complete spec that can be handed off for implementation.

## When to Create a Feature

Create a feature spec when:
- Design decisions are made
- Implementation approach is clear
- Prerequisites/dependencies are identified
- Acceptance criteria can be defined

## Steps

### 1. Move from brewing to features

```bash
# Move the file
git -C ./.notes mv brewing/idea-name.md features/feature-name.md
```

### 2. Structure the spec

Use this template:

```markdown
# Feature Name

Brief description (1-2 sentences).

## Objective

What problem does this solve? What value does it provide?

## Prerequisites / Dependencies

- Must complete: Feature X, Feature Y
- Blocks: Feature Z
- Related: Feature W (can parallelize)

## Implementation Steps

1. Schema changes
   - Add column X to table Y
   - Create index on Z

2. Update functions
   - Modify `function_name()` to handle...
   - Add new `new_function()` for...

3. DSL changes
   - Add `.method()` to Flow class
   - Update type inference for...

4. Tests
   - PgTAP: Test new schema constraints
   - Vitest: Test DSL compilation

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Documentation updated

## Cross-References

- Depends on: [remove-run-key.md](remove-run-key.md)
- Enables: [subflows.md](subflows.md)
- See also: [conditional-execution.md](conditional-execution.md) for related pattern
```

### 3. Commit the feature

```bash
git -C ./.notes add features/feature-name.md
git -C ./.notes commit -m "Add: feature spec for feature-name"
```

### 4. Add to roadmap

Update roadmap.md with this feature's position:
→ See [Organize Roadmap](organize-roadmap.md)

## Key Principles

- **One file per feature**: Keep features/ flat, no subfolders
- **Implementation-ready**: Should be clear enough to start coding
- **Cross-reference**: Link to related features explicitly
- **Explicit links**: Use `[file.md](file.md)` for GitHub browsing
- **Keep updated**: Update as design evolves

## Example

```bash
# Move from brewing
git -C ./.notes mv brewing/manual-execution.md features/manual-execution.md

# Edit to add full spec structure
# (Add objective, prerequisites, implementation steps, etc.)

# Commit
git -C ./.notes add features/manual-execution.md
git -C ./.notes commit -m "Add: feature spec for manual execution"
```

## Next Steps

After creating feature spec:
1. Add to roadmap.md with proper sequencing
2. Link dependencies to other features
3. Begin implementation when roadmap position is reached
