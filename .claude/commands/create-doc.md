You are tasked with creating new documentation following pgflow's guidelines, Diataxis framework, and style conventions.

## Context

Project documentation location: `pkgs/website/src/content/docs/`

Current directory structure:
<structure>
!`tree pkgs/website/src/content/docs/ -L 2 -d`
</structure>

User request:
<request>
$ARGUMENTS
</request>

## Process

### Step 1: Determine Content Type (Diataxis)

Analyze the user's request and determine which Diataxis category this document belongs to:

**TUTORIALS** (Learning-oriented) - get-started/, tutorials/
- First-time learning experience
- Step-by-step with expected outcomes
- Complete working examples
- "Create your first X"

**HOW-TO GUIDES** (Problem-oriented) - develop/, operate/
- Solving specific problems
- Assumes basic knowledge
- Practical, real-world scenarios
- "How to do X"

**EXPLANATIONS** (Understanding-oriented) - concepts/, comparisons/
- Building mental models
- Why and how it works
- Design decisions and tradeoffs
- No step-by-step instructions

**REFERENCE** (Information-oriented) - reference/
- Dry, factual specifications
- API signatures, options, types
- Tables and lists
- No explanations or examples

Present your analysis to the user:
```
Content Type: [CATEGORY]
Reasoning: [Why this category]
Suggested Location: pkgs/website/src/content/docs/[path]/[filename].mdx
```

WAIT for user confirmation or correction.

### Step 2: Create Document Structure

Based on the confirmed content type, create a document following these patterns:

**For TUTORIALS:**
```markdown
---
title: [Clear, action-oriented title]
description: [One-line description]
sidebar:
  order: [number]
---

import { Aside, Steps } from '@astrojs/starlight/components';

[1-2 sentence introduction]

<Aside type="caution">
**Prerequisites**
- Prerequisite 1
- Prerequisite 2
</Aside>

## 1. [First Step]

[Brief explanation]

[Code example with frame="none" for commands]

[Expected outcome]

## 2. [Second Step]

...

## Next Steps

[Links to related content using LinkCard]
```

**For HOW-TO GUIDES:**
```markdown
---
title: [Problem-focused title]
description: [One-line description]
---

import { Aside, LinkCard } from '@astrojs/starlight/components';

[Problem statement - what this solves]

## Solution

[Direct instructions]

[Code examples with highlighting]

## Learn More

[Links to related concepts and tutorials]
```

**For EXPLANATIONS:**
```markdown
---
title: [Concept name]
description: [One-line description]
---

[Conceptual overview]

## [Major Concept 1]

[Explanation with diagrams if helpful]

## [Major Concept 2]

...

## Summary

[Recap key points]
```

**For REFERENCE:**
```markdown
---
title: [API/Config name]
description: [One-line description]
---

[Minimal introduction]

## [Section Name]

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| ... | ... | ... | ... |

[Tables and lists only, no examples]
```

### Step 3: Apply Style Guidelines

Ensure the document follows ALL these rules:

**Character Guidelines:**
- Use straight quotes ("" '') NOT curly quotes
- Use hyphens (-) NOT em-dashes (—)
- Use straight apostrophes (') NOT curly apostrophes (')
- Use three periods (...) NOT ellipsis (…)
- Use regular spaces NOT non-breaking spaces

**Voice and Perspective:**
- Use impersonal language for technical descriptions ("pgflow does X")
- Use "you" ONLY when directly instructing the reader
- NEVER use "we", "our", "let's" in technical descriptions
- Exception: "you" is okay in tutorials

**Naming Convention:**
- Always lowercase: "pgflow" (NEVER PgFlow, pgFlow, PGFlow)
- Exception: PascalCase in class names (Pgflow)

**Code Examples:**
- Use `frame="none"` for bash commands
- Add title attribute for context: `title="filename.ts"`
- Highlight important lines: `{1-3,5}` or `"highlightedTerm"`
- Include TypeScript type annotations
- Keep examples focused and concise

**Links:**
- Always use trailing slashes: `/path/to/page/`
- Use absolute paths for internal links
- Use descriptive link text, not "click here"

**Frontmatter:**
- Always include title and description
- Use sidebar.order for positioning if needed
- Keep descriptions concise (one line)

### Step 4: Write the Document

Create the complete document following all guidelines above.

Present the document to the user for review.

### Step 5: Create the File

Once approved, write the file to the determined location.

## Important Reminders

- **Single purpose**: One content type per document
- **No mixed content**: Don't mix tutorial + explanation + reference
- **Cross-reference**: Link to related content instead of duplicating
- **MVP mindset**: Focus on core value, avoid over-complexity
- **Code examples**: Always real-world, working examples
- **Diataxis compliance**: Strict adherence to content type patterns

## Output

Write to: `pkgs/website/src/content/docs/[determined-path]`

Confirm file creation and suggest any related updates needed (navigation, redirects, etc.)
