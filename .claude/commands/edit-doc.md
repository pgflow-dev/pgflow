You are tasked with improving existing documentation by enhancing clarity, fixing issues, and maintaining consistency with pgflow's style guidelines.

## Context

Documentation root: `pkgs/website/src/content/docs/`

User request:
<request>
$ARGUMENTS
</request>

## Process

### Step 1: Identify Target Document

Based on the user's request, determine which document(s) to edit.

**If path provided explicitly:**
- Confirm the file exists
- Read the file

**If description provided:**
- Search for relevant files using grep or glob
- Present matches to user in a/b/c format
- WAIT for user selection

### Step 2: Read and Analyze Current State

Read the identified document and analyze:

1. **Content Type Compliance**
   - Is this strictly Tutorial / How-to / Explanation / Reference?
   - Any mixed content that violates Diataxis?

2. **Common Issues**
   - Voice inconsistencies ("we", "let's" in technical descriptions)
   - Character issues (em-dashes, curly quotes)
   - Verbosity (can it be more concise?)
   - Missing examples or unclear explanations
   - Broken or missing cross-references
   - Callout overuse (more than 3 Asides)

3. **Structural Issues**
   - Logical flow problems
   - Missing sections (prerequisites, next steps)
   - Heading hierarchy issues
   - Code examples without context

4. **Style Violations**
   - "pgflow" capitalization
   - Link format (trailing slashes)
   - Frontmatter completeness

Present analysis to user:
```markdown
## Analysis: [filename]

**Content Type:** [Tutorial/How-to/Explanation/Reference]

**Issues Found:**
- [Issue 1]
- [Issue 2]
...

**Suggested Improvements:**
1. [Improvement 1]
2. [Improvement 2]
...
```

WAIT for user confirmation on which improvements to apply.

### Step 3: Apply Improvements

Based on user confirmation, apply the requested improvements following these guidelines:

#### Voice and Perspective
```diff
# Fix impersonal language
- Let's set up pgflow
+ Set up pgflow

- Our flow will process data
+ This flow processes data

- We provide a CLI tool
+ pgflow provides a CLI tool
```

#### Simplification
- Remove redundant explanations
- Consolidate similar points
- Replace verbose phrases with concise alternatives
- Keep one example per concept (not three variations)

#### Character Fixes
- Replace em-dashes (—) with hyphens (-)
- Replace curly quotes ("") with straight quotes ("")
- Replace curly apostrophes (') with straight apostrophes (')
- Replace ellipsis (…) with three periods (...)

#### Code Example Improvements
- Add missing title attributes
- Add highlighting for important lines
- Add brief context before code blocks
- Ensure frame="none" for bash commands

#### Cross-Reference Improvements
- Add "Learn More" sections with LinkCards
- Link to related concepts from how-tos
- Link to how-tos from explanations
- Add "Next Steps" to tutorials

#### Callout Optimization
- Reduce to maximum 3 Asides per page
- Convert less important callouts to regular text
- Reserve Asides for: Prerequisites, Warnings, Key Tips

### Step 4: Present Changes

Show the user a summary of changes made:
```markdown
## Changes Applied to [filename]

**Voice/Perspective:** [count] fixes
**Character fixes:** [count] fixes
**Simplified:** [description]
**Code examples:** [improvements]
**Cross-references:** [added links]
**Callouts:** [reduced from X to Y]

[Show key excerpts of changes if helpful]
```

### Step 5: Write Updated File

Apply all approved changes using the Edit tool.

Confirm completion and suggest any follow-up actions (e.g., "might want to audit related docs for similar issues").

## Common Improvement Patterns

### Pattern 1: Tutorial Voice Cleanup
**Before:**
> Now that we've installed pgflow, let's create our first flow. We'll define a simple workflow...

**After:**
> Now that pgflow is installed, create your first flow. Define a simple workflow...

### Pattern 2: Simplify Verbose Explanations
**Before:**
> In order to be able to successfully compile your flow definitions into SQL migrations that can then be applied to your database, you need to make sure that you have properly configured the pgflow compiler with the correct settings.

**After:**
> Configure the compiler before compiling flows to SQL migrations.

### Pattern 3: Add Missing Context
**Before:**
```typescript
export const myFlow = defineFlow({
  slug: "example",
  execute: async (context) => { ... }
});
```

**After:**
```typescript title="flows/my-flow.ts"
// Define a flow that processes user data
export const myFlow = defineFlow({
  slug: "example",
  execute: async (context) => { ... }
});
```

### Pattern 4: Reduce Callout Density
**Before:** 5 Asides breaking reading flow

**After:**
- Keep: Prerequisites (caution)
- Keep: Critical warning (danger)
- Convert rest to: regular paragraphs or tables

### Pattern 5: Add Cross-References
**Before:** Document ends abruptly

**After:**
```markdown
## Learn More

<CardGrid>
  <LinkCard title="Understanding Flows" href="/concepts/flows/understanding-flows/" />
  <LinkCard title="Monitor Execution" href="/operate/observe/monitor-execution/" />
</CardGrid>
```

## Important Reminders

- **Preserve user intent**: Don't change technical accuracy
- **Keep it simple**: Per MVP guidelines, avoid over-engineering improvements
- **Diataxis first**: Content type violations are highest priority
- **Style consistency**: Follow ALL character and voice guidelines
- **Test links**: Ensure all added links are valid
- **Maintain tone**: Keep approachable but professional

## Special Cases

**If document has mixed content (violates Diataxis):**
- Point this out to user
- Suggest using `/split-doc` command instead
- Only apply style fixes, not structural changes

**If document is too long (>300 lines):**
- Suggest splitting into multiple pages
- Provide outline of how to split

**If major structural issues:**
- Suggest complete rewrite using `/create-doc`
- Or create detailed restructuring plan for user approval

## Output

Use Edit tool to apply approved changes to the document.

Confirm completion with summary of improvements made.
