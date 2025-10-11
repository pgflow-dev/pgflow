You are tasked with splitting large documentation pages into multiple smaller, focused pages while maintaining Diataxis compliance, preserving links, and adding proper redirects.

## Context

Documentation root: `pkgs/website/src/content/docs/`

Target document:
<target>
$ARGUMENTS
</target>

## Core Principle

**MVP mindset:** Split only when necessary. Each resulting page should have a clear, single purpose aligned with Diataxis framework.

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

WAIT for user confirmation or adjustment.

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

### Step 4: Create New Files

For each new file in the split:

1. **Create proper frontmatter**
```yaml
---
title: [Clear, focused title]
description: [One-line description]
sidebar:
  order: [number]
---
```

2. **Add necessary imports**
```typescript
import { Aside, LinkCard, CardGrid } from '@astrojs/starlight/components';
```

3. **Write file-specific introduction**
   - Oriented to this file's specific focus
   - Links to related split files if part of series

4. **Include relevant content from original**
   - Copy sections as mapped
   - Adapt transitions between sections
   - Add cross-references to other split files

5. **Add navigation aids**
   - "Part of [topic] series" callout if applicable
   - "Next/Previous" links for sequential content
   - "Learn More" section with LinkCards

**Example structure for split file:**
```markdown
---
title: [Focused Title]
description: [One-line description]
---

import { Aside, LinkCard, CardGrid } from '@astrojs/starlight/components';

[Brief introduction focused on this specific topic]

<Aside type="tip">
This is part of the [Topic] series. See also:
- [Part 1: Topic A](/path/to/part-1/)
- [Part 3: Topic C](/path/to/part-3/)
</Aside>

## [Section 1]

[Content from original, adapted]

## [Section 2]

[Content from original, adapted]

## Learn More

<CardGrid>
  <LinkCard title="[Related Topic 1]" href="/path/to/related/" />
  <LinkCard title="[Related Topic 2]" href="/path/to/related/" />
</CardGrid>
```

### Step 5: Handle Original File

**If keeping as index/overview:**
- Reduce to high-level overview
- Add CardGrid with links to all split pages
- Keep essential context and navigation

**If deleting:**
- Ensure all content distributed to new files
- Prepare redirect (next step)

**If renaming:**
- Use git mv to preserve history
- Becomes one of the split pages

### Step 6: Update Internal Links

Search for all files linking to the original document:
```bash
grep -r "[original-path]" pkgs/website/src/content/docs/ --include="*.mdx"
```

For each linking file:
1. **Determine which split page is most relevant**
2. **Update link to point to correct split page**
3. **Update link text if needed for clarity**

Example:
```markdown
# Before
See [Understanding Flows](/concepts/flows/) for more details.

# After (if link referenced section now in flows-basics.mdx)
See [Understanding Flow Basics](/concepts/flows/flows-basics/) for more details.
```

### Step 7: Add Redirects

Add redirect entries to `pkgs/website/astro.config.mjs`:

**If original file deleted:**
```javascript
redirects: {
  // Split: understanding-flows into basics/advanced
  '/concepts/flows/': '/concepts/flows/flows-basics/', // Default to basics
}
```

**If original file kept as index:**
```javascript
// No redirect needed if keeping same path
// Or redirect if moving to new location:
redirects: {
  '/concepts/flows/understanding-flows/': '/concepts/flows/', // Now index
}
```

**Anchor redirects (if needed):**
```javascript
redirects: {
  // If specific sections had popular anchor links
  '/concepts/flows/#advanced': '/concepts/flows/flows-advanced/',
}
```

### Step 8: Update Navigation (if needed)

Check sidebar configuration in `pkgs/website/astro.config.mjs`:

**If using autogenerate:**
- Verify autogenerate will pick up new structure correctly
- Adjust sidebar.order in frontmatter if needed for proper ordering

**If manually configured:**
- Update sidebar entries to reflect new structure
- Consider adding a collapsed group for split pages

Example:
```javascript
{
  label: 'Flows',
  items: [
    // Before: single item
    // 'concepts/flows/understanding-flows'

    // After: split items with group
    {
      label: 'Understanding Flows',
      collapsed: false,
      items: [
        'concepts/flows/flows-basics',
        'concepts/flows/flows-advanced',
      ]
    }
  ]
}
```

### Step 9: Apply Style Guidelines

For all new files, ensure compliance:

**Character guidelines:**
- Use straight quotes ("" '') NOT curly quotes
- Use hyphens (-) NOT em-dashes (—)
- Use straight apostrophes (') NOT curly apostrophes (')

**Naming convention:**
- Always lowercase: "pgflow"

**Links:**
- Trailing slashes on all internal links
- Absolute paths

**Voice:**
- Impersonal for technical descriptions
- "you" only when directly instructing

Run style fixes on all new files:
```bash
./scripts/replace-special-chars.sh [file]
```

### Step 10: Verify Split

Run these checks:

1. **All new files created:**
```bash
ls -la pkgs/website/src/content/docs/[new-path]/
```

2. **All content accounted for:**
- Review original file
- Verify each section went to correct new file
- Check nothing was lost

3. **Links updated:**
```bash
# Should return only expected results (if any)
grep -r "[original-path]" pkgs/website/src/content/docs/ --include="*.mdx"
```

4. **Redirects added:**
```bash
grep "[original-path]" pkgs/website/astro.config.mjs
```

5. **Build passes:**
```bash
pnpm nx build website
```

6. **Navigation works:**
- Check sidebar rendering
- Verify order and grouping
- Test links between split pages

Present verification results:
```markdown
## Verification Results

✓ [count] new files created
✓ All content distributed
✓ [count] internal links updated
✓ [count] redirects added
✓ Build passes
✓ Navigation verified

**New structure:**
```
[tree output showing final structure]
```
```

### Step 11: Create Commit

Prepare structured commit message:
```
refactor(docs): split [original-filename] into focused pages

Split [original-path] into [count] focused pages:
- [new-file-1]: [Brief description]
- [new-file-2]: [Brief description]
...

Changes:
- Create [count] new documentation pages
- Update [count] internal links
- Add [count] redirects
- [Kept/Deleted] original file as [purpose]

Reason: [Brief explanation - e.g., "Diataxis compliance", "Reduce cognitive load", "Better progressive disclosure"]

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>
```

Present commit message to user.

If approved, create commit:
```bash
git add -A && git commit -m "$(cat <<'EOF'
[commit message here]
EOF
)"
```

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

- **Preserve content** - Don't lose information in the split
- **Maintain accuracy** - Verify technical details after splitting
- **Add navigation** - Users need to find related content
- **Cross-reference** - Link split pages together
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

## Output

Use these tools:
1. **Write** - Create new split files
2. **Edit** - Update links, redirects, navigation
3. **Bash** - For git operations, verification
4. **Grep** - Find references to update

Present clear summary:
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

**Commit created** - ready to review and push
```
