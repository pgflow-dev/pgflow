You are tasked with splitting large documentation pages into multiple smaller, focused pages while maintaining Diataxis compliance, preserving links, and adding proper redirects.

## Context

Documentation root: `pkgs/website/src/content/docs/`

Target document:
<target>
$ARGUMENTS
</target>

## Core Principles

**MVP mindset:** Split only when necessary. Each resulting page should have a clear, single purpose aligned with Diataxis framework.

**⚠️ CRITICAL: NO NEW CONTENT CREATION ⚠️**

This command is for **SPLITTING**, not rewriting or creating new content.

**ONLY allowed additions:**
- **Brief intro paragraphs** - Minimal context for each split file (1-2 sentences max)
- **Link cards** - Navigation between split docs using `<LinkCard>` or `<CardGrid>`
- **Aside blocks** - Cross-references linking split docs to each other:
  ```markdown
  :::note[Optional Title]
  Content here
  :::
  ```
  Available types: `note`, `tip`, `caution`, `danger`

**FORBIDDEN:**
- Rewriting or expanding existing content
- Adding new explanations, examples, or sections
- Creating new technical content
- Elaborating on concepts beyond what exists in original

**The goal:** Distribute existing content into focused files, not create a better version.

## Process

### Step 1: Identify and Analyze Target Document

**If path provided:**
- Read the file directly

**If description provided:**
- Search for matching files
- Present options in a/b/c format
- WAIT for user selection

Read the target document and measure:
```markdown
## Document Analysis: [filename]

**Current metrics:**
- Lines: [count]
- Words: [count]
- Sections: [count with names]
- Content type: [Tutorial/How-to/Explanation/Reference]
- Assessment: [Why this needs splitting]
```

### Step 2: Identify Split Strategy

Analyze the document structure and determine split strategy:

#### Strategy A: Diataxis Violation Split
**When:** Document mixes multiple content types
```markdown
**Current:** Tutorial with embedded reference tables and concept explanations

**Split into:**
1. Tutorial: [filename]-tutorial.mdx (get-started/)
2. Reference: [filename]-reference.mdx (reference/)
3. Explanation: [filename]-concepts.mdx (concepts/)

**Reason:** Each content type needs separate treatment
```

#### Strategy B: Topic-Based Split
**When:** Document covers multiple distinct topics
```markdown
**Current:** Single large guide covering A, B, and C

**Split into:**
1. [topic-a].mdx (focus on A)
2. [topic-b].mdx (focus on B)
3. [topic-c].mdx (focus on C)
4. index.mdx (overview with links to all)

**Reason:** Each topic deserves focused attention
```

#### Strategy C: Depth-Based Split
**When:** Document has overview + deep-dive sections
```markdown
**Current:** Introduction with extensive advanced sections

**Split into:**
1. [topic].mdx (overview + common use)
2. [topic]-advanced.mdx (advanced patterns)

**Reason:** Progressive disclosure - basic users need simple path
```

#### Strategy D: Step-Based Split
**When:** Tutorial has too many steps (>5-6)
```markdown
**Current:** Single tutorial with 10+ steps

**Split into:**
1. [topic]-basics.mdx (steps 1-3)
2. [topic]-intermediate.mdx (steps 4-6)
3. [topic]-advanced.mdx (steps 7-10)

**Reason:** Cognitive load reduction, clear progression
```

Present split strategy:
```markdown
## Proposed Split Strategy

**Strategy:** [A/B/C/D - name]

**Current file:** pkgs/website/src/content/docs/[path]/[filename].mdx
**Target structure:**
```
[directory tree showing new structure]
```

**Files to create:**
1. **[new-file-1].mdx** - [Description of content]
   - Sections: [which sections move here]
   - Word count estimate: [count]

2. **[new-file-2].mdx** - [Description of content]
   - Sections: [which sections move here]
   - Word count estimate: [count]

...

**Original file disposition:**
- [ ] Delete (content fully distributed)
- [ ] Keep as index/overview (with links to split pages)
- [ ] Rename and keep as one of the split pages

**Redirects needed:** [count]
**Internal links to update:** [estimated count]
```

**WAIT for user confirmation or adjustment.**

### Step 3: Map Content Distribution

For each section in the original document, determine destination:
```markdown
## Content Distribution Map

**Original Section → Destination**

### Section 1: [name]
→ [new-file-1].mdx (lines 1-50)

### Section 2: [name]
→ [new-file-1].mdx (lines 51-100)

### Section 3: [name]
→ [new-file-2].mdx (lines 1-60)

...

**Shared content (appears in multiple):**
- Introduction paragraph → adapted for each file
- Prerequisites → duplicated where relevant
```

### Step 4: Execute Split with Task Agent

**Launch a general-purpose task agent to perform the split execution.**

Present the task summary to the user before launching:

```markdown
## Task Agent Instructions

I'm launching a task agent to execute the split with these instructions:

**Context:**
- Original file: [path]
- Split strategy: [strategy name from Step 2]
- Content distribution: [reference to Step 3 map]
- Files to create: [count]

**Agent will:**
1. Read NOMENCLATURE_GUIDE.md for terminology standards
2. Read DOCS_GUIDE.md for all formatting and style guidelines
3. Create [count] new split files following the content distribution map
4. Handle original file per strategy ([keep/delete/rename])
5. Update internal links across documentation
6. Add redirects to astro.config.mjs
7. Apply style guidelines (character fixes, naming conventions)
8. Verify build passes
9. Prepare commit message

**Critical constraints for agent:**
- ⚠️ NO NEW CONTENT - Only split existing content, don't rewrite or expand
- Copy exact wording from original document
- Add ONLY: brief intros (1-2 sentences), link cards, :::note blocks for navigation
- Use :::note[Title] syntax (not <Aside> component)
- All internal links must have trailing slashes
- Follow all DOCS_GUIDE.md patterns for components and structure
```

**Launching agent...**

Use the Task tool with subagent_type "general-purpose" and provide:
- Full context from Steps 1-3
- Content distribution map
- Instructions to read guide files (NOMENCLATURE_GUIDE.md for brief intros, DOCS_GUIDE.md for formatting)
- NO NEW CONTENT constraint emphasis
- Instructions to report back with:
  - Files created
  - Links updated
  - Redirects added
  - Build verification status
  - Proposed commit message

## Common Split Patterns

### Pattern 1: Tutorial + Reference Separation
```
FROM: /get-started/create-flows.mdx (tutorial + API reference)

TO:
- /get-started/create-flows.mdx (tutorial only)
- /reference/define-flow-api.mdx (API reference)

Redirect: None (original kept, reference extracted)
```

### Pattern 2: Multi-Topic How-To Split
```
FROM: /develop/working-with-flows.mdx (deployment + testing + debugging)

TO:
- /develop/deploy-flows.mdx (deployment focus)
- /develop/test-flows.mdx (testing focus)
- /develop/debug-flows.mdx (debugging focus)
- /develop/flows/index.mdx (overview with links)

Redirect: '/develop/working-with-flows/': '/develop/flows/'
```

### Pattern 3: Progressive Depth Split
```
FROM: /concepts/architecture.mdx (overview + deep technical details)

TO:
- /concepts/architecture/overview.mdx (high-level concepts)
- /concepts/architecture/internals.mdx (deep technical details)

Redirect: '/concepts/architecture/': '/concepts/architecture/overview/'
```

### Pattern 4: Long Tutorial Split
```
FROM: /tutorials/build-application.mdx (10 steps, 400+ lines)

TO:
- /tutorials/build-application/part-1-setup.mdx (steps 1-3)
- /tutorials/build-application/part-2-implementation.mdx (steps 4-6)
- /tutorials/build-application/part-3-deployment.mdx (steps 7-10)
- /tutorials/build-application/index.mdx (overview + links)

Redirect: '/tutorials/build-application/': '/tutorials/build-application/part-1-setup/'
```

## Decision Guidelines

### When to Split

**Split if:**
- Document >300 lines (very long)
- Mixed Diataxis types (tutorial + reference)
- Multiple distinct topics (A, B, and C)
- Tutorial >6-7 steps
- Users say "hard to find X in this page"
- More than 5 H2 sections

**Don't split if:**
- Document <200 lines (medium is okay)
- Single focused topic
- Content is tightly coupled
- Split would create orphaned pages
- Navigation would become confusing

### How to Split

**By content type (Diataxis):**
- Highest priority split
- Tutorial/How-to/Explanation/Reference must be separate

**By topic:**
- Natural when document covers distinct subjects
- Each topic should stand alone

**By depth:**
- Good for progressive disclosure
- Basic/Intermediate/Advanced

**By sequence:**
- Natural for long tutorials
- Part 1/Part 2/Part 3

## Important Reminders

- **NO NEW CONTENT** - Only split existing content, don't rewrite or expand
- **Preserve content** - Don't lose information in the split
- **Copy, don't rewrite** - Keep exact wording from original document
- **Minimal additions** - Only brief intros and navigation aids (link cards, `:::note` blocks)
- **Maintain accuracy** - Verify technical details after splitting
- **Add navigation** - Users need to find related content using link cards and aside blocks
- **Cross-reference** - Link split pages together using `:::note[Title]` syntax
- **Test thoroughly** - Build, links, redirects, navigation
- **Diataxis first** - Content type violations are primary split reason
- **Clear commits** - Explain why split was needed

## Error Handling

**If unclear how to split:**
- Present multiple options to user
- Explain pros/cons of each approach
- WAIT for user decision

**If split would create too many files (>5):**
- Warn user about complexity
- Suggest alternative organization
- Consider hierarchical grouping

**If content is tightly coupled:**
- Warn that split may hurt comprehension
- Suggest simplification instead
- Offer to proceed only if user confirms

**If build fails after split:**
- Show build errors
- Identify cause (broken links, etc.)
- Offer to fix or revert

## Special Cases

**Splitting index.mdx:**
- Consider impact on parent directory URL
- May need to create new index.mdx
- Multiple redirects may be needed

**Splitting with many inbound links:**
- Extra care in link updates
- May need multiple redirects
- Consider which split page is "primary"

**Splitting reference documentation:**
- Split by logical API groupings
- Consider user lookup patterns
- Maintain completeness in each split

**Cross-package content:**
- Rare, but may need to move to different package
- Update package-specific configuration
- More complex redirect handling

## Output Format

After the task agent completes, present results to the user:

```markdown
## Split Complete: [original-filename]

**Created [count] new files:**
1. [new-file-1].mdx - [Description]
2. [new-file-2].mdx - [Description]
...

**Changes applied:**
✓ [count] new files created
✓ [count] internal links updated
✓ [count] redirects added
✓ Original file [kept as index/deleted/renamed]
✓ Navigation updated
✓ Build verification passed

**Next:** Review the changes and create commit if satisfied.
```
