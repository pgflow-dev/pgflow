# Promote to Brewing

Move vetted ideas from scratch to brewing for exploration.

## Purpose

Promotion means "this idea is worth serious consideration". Brewing is where ideas get explored, refined, and evaluated before becoming feature specs.

## When to Promote

Promote an idea when:
- It solves a real problem
- It aligns with project goals
- It's worth time to explore (even if not ready to implement)
- It might inform future decisions

## Steps

### 1. Move the file

```bash
# Move from scratch to brewing
git -C "$notes" mv scratch/idea-name.md brewing/
```

### 2. Update the title (optional)

Add "IDEA:" prefix to H1 if not already present:

```markdown
# IDEA: Feature Name
```

### 3. Add initial context (if needed)

Add a few lines about:
- Why this is worth exploring
- Related features or constraints
- Open questions to answer

### 4. Git commit

```bash
git -C "$notes" add brewing/idea-name.md
git -C "$notes" commit -m "Promote: idea-name to brewing"
```

## Example

```bash
# Move the file
git -C "$notes" mv scratch/taskless-maps.md brewing/

# File content (brewing/taskless-maps.md):
# IDEA: Taskless Map Steps
#
# Map steps with zero elements should complete without creating tasks.
#
# Why worth exploring:
# - Reduces database overhead
# - Simplifies step completion logic
# - Enables conditional fanouts
#
# Related: Phase 3 (Step Output Storage)
# Question: How do dependents handle empty arrays?

# Commit
git -C "$notes" add brewing/taskless-maps.md
git -C "$notes" commit -m "Promote: taskless-maps to brewing"
```

## Key Principles

- **Low barrier**: Don't require full spec, just enough to explore
- **Git tracks movement**: Use `git mv` to preserve history
- **Context helps**: Add why it's worth exploring
- **Can stay in brewing**: Ideas can remain here indefinitely while being refined

## Next Steps

When idea is fully spec'd and ready to implement:
→ See [Refine to Features](refine-features.md)
