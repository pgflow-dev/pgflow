# Search & Discovery

Find related work and discover relationships.

## Content Search

**Default (excludes archive):**
```bash
scripts/search "pattern"
```

**Examples:**
```bash
# Find context-related work
scripts/search "(context|ctx)"

# Find refactoring plans
scripts/search "(refactor|restructure|redesign)"

# Multiple terms
scripts/search "(feature|enhancement).?(worker|executor)"
```

**Output format:**
```
/path/to/file.md | File Title From H1
```

**Search tips:**
- Use regex alternatives: `(term1|term2)`
- Include synonyms: `(refactor|restructure)`
- Case-insensitive by default

## Search Archive Explicitly

**Only when user requests:**
```bash
scripts/search "pattern" "$notes/archive/"
```

User must explicitly say: "Search archive for X"

## List Directory Titles

**When you know the location:**
```bash
scripts/list-titles "$notes/scratch/"
scripts/list-titles "$notes/brewing/"
scripts/list-titles "$notes/features/"
```

**Multiple locations:**
```bash
scripts/list-titles "$notes/scratch/" "$notes/brewing/" "$notes/features/"
```

**Output format:**
```
/path/to/file.md | File Title From H1
```

## Proactive Search

**During work:**
- Search related ideas/plans when relevant
- Suggest context: "Found related plan X - read it?"
- Discover relationships automatically

**Examples:**
- User working on subflows → Search for "run key" or "structured returns"
- User creating feature spec → Search for related features
- User promoting idea → Search for similar work in brewing

## Discovery Workflow

1. **User asks about topic:**
   "What ideas do we have about caching?"

2. **Search:**
   ```bash
   scripts/search "(caching|cache)"
   ```

3. **Show results with titles:**
   - scratch/query-caching.md | Quick thought on caching
   - brewing/performance.md | IDEA: Performance Optimizations
   - features/cache-layer.md | Cache Layer Implementation

4. **User selects which to read**

5. **Load full content** only when selected

## Key Points

- **Archive excluded by default** - keeps results relevant
- **Show all results** - let user choose
- **Load content progressively** - only when needed
- **Be proactive** - search when helpful, suggest context
