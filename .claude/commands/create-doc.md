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

**WAIT for user confirmation or correction.**

### Step 2: Preview Document Structure

Based on the confirmed content type, show the user which template structure will be used:

**For TUTORIALS:**
```markdown
- Frontmatter with title/description
- Brief introduction (1-2 sentences)
- Prerequisites in :::caution block
- Sequential steps using <Steps> component
- Code examples with frame="none" for bash
- Next Steps section with LinkCards
```

**For HOW-TO GUIDES:**
```markdown
- Frontmatter with title/description
- Problem statement opening
- Direct solution sections
- Multiple pattern examples
- Learn More section with LinkCards
```

**For EXPLANATIONS:**
```markdown
- Frontmatter with title/description
- Conceptual overview
- Progressive narrative (simple → complex)
- Mental models and "why" sections
- Cross-references to related concepts
```

**For REFERENCE:**
```markdown
- Frontmatter with title/description
- Minimal introduction
- Tables for parameters/options
- Type definitions
- Terse descriptions (no elaboration)
```

Present structure overview and confirm with user before proceeding.

### Step 3: Create Document with Task Agent

**Launch a general-purpose task agent to create the document.**

Present the task summary to the user before launching:

```markdown
## Task Agent Instructions

I'm launching a task agent to create the documentation with these instructions:

**Context:**
- Content type: [TUTORIAL/HOW-TO/EXPLANATION/REFERENCE]
- File location: pkgs/website/src/content/docs/[path]/[filename].mdx
- User request: [original request]

**Agent will:**
1. Read NOMENCLATURE_GUIDE.md for terminology standards
2. Read ARCHITECTURE_GUIDE.md for architectural accuracy
3. Read DOCS_GUIDE.md for all formatting, style, and component patterns
4. Create complete document following the [content type] template
5. Apply all style guidelines (characters, naming, voice, links)
6. Ensure Diataxis compliance for [content type]
7. Use appropriate components (:::note syntax, LinkCards, Steps, etc.)
8. Present draft for review

**Critical requirements:**
- Follow DOCS_GUIDE.md patterns exactly
- Use :::note[Title] syntax (not <Aside> component)
- All internal links must have trailing slashes
- Use "pgflow" (lowercase) throughout
- Match tone to content type (instructional vs explanatory)
- Include proper frontmatter with sidebar.order if needed
```

**Launching agent...**

Use the Task tool with subagent_type "general-purpose" and provide:
- Content type from Step 1
- File location
- User's original request
- Instructions to read all guide files (NOMENCLATURE_GUIDE.md, ARCHITECTURE_GUIDE.md, DOCS_GUIDE.md)
- Instructions to present complete draft before writing file
- Reminder to follow all guide patterns for terminology, architecture, and formatting

## Important Reminders

- **Diataxis compliance**: Strict adherence to content type patterns
- **Single purpose**: One content type per document - don't mix tutorial + explanation + reference
- **Cross-reference**: Link to related content instead of duplicating
- **MVP mindset**: Focus on core value, avoid over-complexity
- **Follow DOCS_GUIDE.md**: All formatting, components, and style rules are defined there

## Output Format

After the task agent completes, present results to the user:

```markdown
## Document Created: [filename]

**File location:** `pkgs/website/src/content/docs/[path]/[filename].mdx`
**Content type:** [TUTORIAL/HOW-TO/EXPLANATION/REFERENCE]
**Lines:** [count]

**Next steps:**
- Review the content for accuracy
- Build the website to verify: `pnpm nx build website`
- Update navigation if needed (astro.config.mjs)
- Create commit if satisfied
```
