# pgflow Documentation Guide

Quick reference for maintaining consistent documentation structure and style.

## Documentation Philosophy

**Journey-focused approach**: User success > technical taxonomy. Structure guides users: Get Started → Build → Deploy, with supporting materials for deep understanding.

**Core Principles**: Progressive learning path, context-aware grouping, Diátaxis-informed, flat URLs, comprehensive redirects.

**PRAGMATIC, NOT PEDANTIC**: Serve users first. Mix content types if it helps. Keep install sections in how-tos if brief. Skip formalities when content is clear.

## Navigation Structure

### Seven Main Sections

1. **Get Started** - Entry point, sequential tutorials
2. **Build** - Development workflows, pattern-based how-tos
3. **Deploy** - Production operations, monitoring, maintenance
4. **Concepts** - Mental models, architecture, flow definitions
5. **Reference** - API docs, configuration, lookup info
6. **Tutorials** - Complete real-world projects
7. **Comparisons** - Technology selection support

### Filesystem vs Navigation vs URLs

**Key Pattern**: Filesystem = developer clarity, Navigation labels = user understanding, URLs = simple/memorable.

Example: `src/content/docs/get-started/flows/` → Label: "Flows" → URL: `/get-started/flows/create-flow/`

Many nested navigation groups have flat URLs: `Build > Writing Flows > Organize` → `/build/organize-flow-code/`

### When to Nest in Filesystem/URL

**NEST when:**
1. **Platform-specific** - `deploy/supabase/` (future: cloudflare, aws)
2. **Sequential series** - `get-started/flows/`, `tutorials/ai-web-scraper/`
3. **Alternative paths** - `get-started/background-jobs/` vs `flows/`
4. **Reference collections** - `reference/configuration/`, `reference/queue-worker/`
5. **Generic names** - `starting-flows/typescript-client` (avoids collision)
6. **Needs overview page** - `starting-flows/index.mdx` compares approaches

**FLATTEN when:**
1. **Conceptual groupings** - "Writing Flows", "Observe" (may rename)
2. **Unique names** - `organize-flow-code`, `monitor-execution`
3. **Future flexibility** - Rename sidebar groups without breaking URLs
4. **Cross-cutting concerns** - "APIs" (just admin grouping)

**Rule**: Nest if URL context helps users understand the page. Flatten if it's just sidebar organization.

### Autogenerate vs Manual

**Autogenerate** for: Complete directories, sequential series, platform guides. Order via `sidebar.order` frontmatter.

**Manual** for: Conceptual groupings across flat files, nested nav without nested URLs, selective inclusion, custom labels.

## Content Type Quick Reference (Diátaxis-Informed)

**Note:** We don't use `contentType` in frontmatter. These are guidelines, not strict rules.

| Type | Structure | Tone | Depth | Key Features |
|------|-----------|------|-------|--------------|
| **Tutorial** | 1. Context 2. Prerequisites 3. `<Steps>` 4. Next steps | Direct ("Let's", "Now") | Step-by-step | Sequential, completion-focused |
| **How-To** | 1. Problem 2. Code 3. Explanation 4. Patterns | Instructional | Task-oriented | Multiple examples, OK to include brief setup |
| **Concept** | 1. Overview 2. Progressive 3. "Why" 4. Diagrams | Factual, neutral | 150-350 lines | Mental models, design transparency |
| **Reference** | 1. Hierarchy 2. Template 3. Tables 4. Examples | Terse (1-2 sentences) | 70-250 lines | Lookup, exhaustive, type-first |

**Pragmatic Mixing OK:**
- Brief installation/setup in how-to guides (< 50 lines)
- "When to use" sections in tutorials
- Code examples in concept docs

## Common Components

### Frontmatter (Required)
```yaml
---
title: Brief, action-oriented title
description: One-line description focusing on outcome
sidebar:
  order: 10  # Lower = higher in sidebar
---
```

### Steps Component
```jsx
<Steps>
1. ### Step Title
   Content here.
2. ### Next Step
   More content.
</Steps>
```
**Note**: Numbering is automatic; use H3 for titles.

### Asides (:::syntax)
```markdown
:::caution[Prerequisites]      # Yellow, for requirements
:::note[Key Concepts]          # Blue, for info
:::tip[Pro Tip]                # Green, for suggestions
:::danger[Prohibited Changes]  # Red, for destructive ops
```

### Code Blocks
````markdown
```bash frame="none"                    # Commands (easy copy)
```typescript title="file.ts"          # Files with titles
```diff lang="toml"                    # Config changes
```typescript {1-3,5} "term"           # Line/string highlighting
```sql                                 # Queries
````

### Cards and Navigation
```jsx
<Card title="..." icon="rocket">...</Card>

<CardGrid>
  <LinkCard title="..." href="/path/" description="..." />
</CardGrid>
```
**Usage**: End of tutorials (next steps), overview pages (grouped sections), within notes (related reading).

### Other Components
```jsx
<FileTree>...</FileTree>                            # Directory structures
<Tabs><TabItem label="Before">...</TabItem></Tabs>  # Comparisons
<details><summary>Read more</summary>...</details>  # Collapsible content

import NotProductionReady from '@/components/NotProductionReady.astro';
import SecuritySetupWarning from '@/components/SecuritySetupWarning.astro';
```

### Tables
```markdown
| Feature | Option A | Option B |           # Comparison tables
| Parameter | Type | Required | Description |  # API parameters
| Safe | Breaking |                            # Change classifications
```

## Writing Style

### Voice
- **Tutorials/How-tos**: Use "you", present tense, action-oriented ("Let's", "Now")
- **Concepts**: Factual, neutral; avoid "we/our"; "you" only when instructing
- **Examples**: "Run the installer" vs "pgflow compiles flows into SQL"

### Emphasis
- **Bold** for key concepts
- `Code format` for technical terms, paths, variables
- [Inline links](/path/) for references

### Organization
- **Paragraphs**: 2-4 sentences, one idea each
- **Lists**: Bullets for related points, numbers for sequences
- **Headings**: H2 for sections, H3 for subsections, never H1 (from frontmatter)

## Page Patterns

### Overview Pages (index.mdx)
- **Title**: Meaningful, not just "Overview" (e.g., "Choose your approach")
- **Structure**: Opening → H2 sections with CardGrids
- **Examples**: `/build/starting-flows/index.mdx` (comparison), `/build/index.mdx` (overview)

### Prerequisites & Next Steps
```markdown
:::caution[Prerequisites]
- Items with [links](/path/)
:::

## Next Steps / Where next?
<CardGrid><LinkCard ... /></CardGrid>
```

### Cross-Referencing
- **Top**: `:::tip` with related link
- **Bottom**: "Learn More" with CardGrid
- **Inline**: Essential prerequisites, technical terms

## File Naming & Organization

**Pattern**: kebab-case with action verbs (`create-reusable-tasks.mdx`, `monitor-execution.mdx`)

**Avoid**: Generic names (`tasks.mdx`), past tense (`created-tasks.mdx`)

**Subdirectories** for: Multiple pages on one topic, platform-specific content, tutorial series

### Sidebar Ordering
```yaml
sidebar:
  order: 25  # Overview: none, Main: 10-50, Advanced: 50-100
```

## Special Patterns

### Sequential Tutorials
Link to prerequisites: `Completed the [previous step](/path/)`

### Warning Hierarchy
- `:::danger` - Destructive, data loss
- `:::caution` - Important but not destructive
- `:::tip` - Helpful optimizations

### Problem/Solution
```markdown
### Problem: Description
Code showing problem.

### Solution: How to fix
Code showing solution.

**Why this works**: Explanation.
```

### Expected Outcomes
Show SQL results, command output after examples.

## URL Guidelines

**Always use trailing slashes**: `/path/` not `/path` (enforced by config)

**Redirects** in `astro.config.mjs`:
```javascript
redirects: {
  '/old-path/': '/new-path/',
}
```
Add when moving existing pages (in main branch). Skip for new pages.

## FAQ Structure
```markdown
## Question as H2?

Short Answer: **Brief statement**

Context paragraph.

:::note
Related info or links.
:::

<details><summary>Read more</summary>
Extended explanation with H3 headings.
</details>
```

## Quality Checklist

**Critical (must-have):**
- [ ] Frontmatter: title, description, sidebar order
- [ ] No H1 (uses frontmatter)
- [ ] Trailing slashes on internal links
- [ ] Code blocks: proper language tags, `frame="none"` for bash
- [ ] File name: kebab-case, action verb
- [ ] Redirects if moving existing pages
- [ ] No special characters (em-dash, curly quotes, etc.)
- [ ] Correct terminology (pgflow not pgFlow, correct architecture terms)

**Nice-to-have (context-dependent):**
- [ ] Prerequisites: `:::caution` (if complex prerequisites)
- [ ] Sequential steps: `<Steps>` (for tutorials)
- [ ] Next steps: Cards/CardGrid (for longer docs)
- [ ] Tone matches type (be helpful, not rigid)

## Character Guidelines

**Never use**: Em-dash (—), curly quotes/apostrophes ("" ' '), ellipsis (…), non-breaking spaces

**Fix with**: `./scripts/replace-special-chars.sh <file_path>`

## Integration with Diátaxis

**We are Diátaxis-INFORMED, not Diátaxis-COMPLIANT.**

Navigation doesn't strictly match categories, but content aligns:
- **Tutorials**: Get Started, Tutorials (sequential, completion-focused)
- **How-to**: Build, Deploy (task-focused, multiple patterns)
- **Explanation**: Concepts, "Why" sections (mental models, rationale)
- **Reference**: Reference section (lookup tables, specifications)

**What this means:**
- No `contentType` in frontmatter (navigation structure implies type)
- Content mixing is OK when it serves users
- Guidelines are tools, not laws
- User success > theoretical purity

## Key Success Factors

1. **Journey-focused**: Sections guide user progression
2. **Depth + discovery**: Detailed pages with extensive cross-linking
3. **Consistent patterns**: Predictable structure across types
4. **Progressive disclosure**: Simple → advanced
5. **Multiple modalities**: Code, diagrams, tables, prose
6. **URL stability**: Redirects preserve historical links
