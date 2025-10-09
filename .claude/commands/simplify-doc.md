You are tasked with simplifying documentation by reducing verbosity, improving clarity, and making content more scannable while preserving accuracy and completeness.

## Context

Documentation root: `pkgs/website/src/content/docs/`

Target document:
<target>
$ARGUMENTS
</target>

## Core Principle

**MVP mindset:** Focus on 80% of value with 20% of effort. Cut ruthlessly. Users value clarity over comprehensiveness.

## Process

### Step 1: Identify Target and Baseline

Read the target document.

Measure baseline metrics:
- Total word count
- Number of sentences
- Number of code examples
- Number of sections
- Average sentence length

Present baseline:
```markdown
## Document Analysis: [filename]

**Current metrics:**
- Words: [count]
- Sentences: [count]
- Avg sentence length: [count] words
- Code examples: [count]
- Sections: [count]

**Assessment:** [Verbose/Appropriate/Concise]
```

### Step 2: Identify Simplification Opportunities

Analyze the document for these patterns:

#### 1. REDUNDANCY
- [ ] Repetitive explanations
- [ ] Same point made multiple ways
- [ ] Redundant examples
- [ ] Duplicate information across sections

#### 2. VERBOSITY
- [ ] Long-winded sentences (>25 words)
- [ ] Unnecessary qualifiers ("very", "really", "actually")
- [ ] Passive voice where active is clearer
- [ ] Complex phrases with simple alternatives

#### 3. OVER-EXPLANATION
- [ ] Explaining obvious things
- [ ] Too much context before getting to point
- [ ] Multiple examples when one suffices
- [ ] Details that belong in reference, not here

#### 4. POOR STRUCTURE
- [ ] Buried lede (main point not upfront)
- [ ] Rambling paragraphs
- [ ] Unclear section organization
- [ ] Missing scanning aids (lists, tables, callouts)

#### 5. CODE BLOAT
- [ ] Code examples too long
- [ ] Showing full files when snippet would work
- [ ] Excessive comments in code
- [ ] Multiple similar examples

Present findings:
```markdown
## Simplification Opportunities

**Redundancy:** [count] instances
- [Example 1]
- [Example 2]

**Verbosity:** [count] sentences to shorten
- [Example with word count]

**Over-explanation:** [count] sections to trim
- [What can be cut or moved]

**Structure:** [improvements needed]
- [Specific structural changes]

**Code:** [count] examples to simplify
- [Which examples]

**Target reduction:** [X]% fewer words
```

WAIT for user confirmation on which simplifications to apply.

### Step 3: Apply Simplifications

#### Technique 1: Sentence Reduction

**Remove filler words:**
```markdown
# Before (28 words)
In order to be able to successfully start your flow, you need to first make sure that you have properly configured all of the necessary settings in your configuration file.

# After (12 words)
Configure the required settings before starting your flow.
```

**Use active voice:**
```markdown
# Before (passive, 10 words)
The flow is defined using the defineFlow function.

# After (active, 7 words)
Define flows using the defineFlow function.
```

**Remove qualifiers:**
```markdown
# Before
This is actually very important and you should really try to...

# After
This is important. Try to...
```

#### Technique 2: Consolidate Repetition

**Before (3 paragraphs saying same thing):**
> First paragraph explaining concept...
> Second paragraph re-explaining same concept...
> Third paragraph example of that same concept...

**After (1 paragraph):**
> Single clear explanation with inline example.

#### Technique 3: Trim Over-Explanation

**Remove obvious context:**
```markdown
# Before
In the world of software development, when you're working with asynchronous operations, which are operations that don't complete immediately and might take some time to finish, you need to handle them properly...

# After
Handle asynchronous operations with:
```

**Move detail to reference:**
```markdown
# Before (in how-to guide)
The maxAttempts option accepts a number between 1 and 100, with a default of 3. This controls how many times the task will retry. The baseDelay option controls the initial delay...

# After
Configure retries:
- `maxAttempts`: number of retry attempts (default: 3)

See [full configuration reference](/reference/configuration/) for all options.
```

#### Technique 4: Improve Structure for Scanning

**Use lists instead of paragraphs:**
```markdown
# Before (paragraph)
The flow needs several things to work properly. First, it needs a slug which must be unique. Second, it needs task definitions. Third, it needs proper error handling configured.

# After (list)
Each flow requires:
- Unique slug
- Task definitions
- Error handling configuration
```

**Use tables for comparisons:**
```markdown
# Before (paragraphs)
When you use single mode, the step runs once...
In array mode, the step runs multiple times...
With map mode, each iteration...

# After (table)
| Mode | Behavior | Use When |
|------|----------|----------|
| single | Runs once | ... |
| array | Runs per item | ... |
| map | Parallel iteration | ... |
```

#### Technique 5: Simplify Code Examples

**Show only relevant parts:**
```typescript
// Before (full file, 40 lines)
import { defineFlow } from "@pgflow/dsl";
import { doThing1 } from "./tasks/thing1";
import { doThing2 } from "./tasks/thing2";
// ... many more imports

export const myFlow = defineFlow({
  slug: "example",
  execute: async (context) => {
    // ... lots of code
  }
});

// After (essential parts, 10 lines)
export const myFlow = defineFlow({
  slug: "example",
  execute: async (context) => {
    // Focus on the relevant part only
    const result = await context.step("process", async () => {
      return doProcessing();
    });
  }
});
```

**Remove obvious comments:**
```typescript
// Before
// This defines a step
const result = await context.step(
  "process", // The step slug
  async () => { // The handler function
    return data; // Return the data
  }
);

// After
const result = await context.step("process", async () => {
  return data;
});
```

### Step 4: Present Simplified Version

Show before/after comparison:
```markdown
## Simplification Results

**Before:** [X] words, [Y] sentences
**After:** [X] words, [Y] sentences
**Reduction:** [Z]%

### Key Changes

1. **Section A:** Reduced from [X] to [Y] words
   - Removed: [What was cut]
   - Kept: [What was preserved]

2. **Section B:** Consolidated 3 examples into 1
   - Removed: [Which examples]
   - Kept: [The clearest example]

3. **Code Examples:** Simplified [count] examples
   - Average reduction: [X]%

[Show key excerpts demonstrating improvements]
```

WAIT for user approval before applying changes.

### Step 5: Apply Changes and Verify

Use Edit tool to apply all approved simplifications.

After applying, verify:
- [ ] Accuracy preserved (no technical errors introduced)
- [ ] Completeness maintained (no essential info removed)
- [ ] Readability improved (easier to scan and understand)
- [ ] Code examples still work
- [ ] Links still valid

Present final metrics:
```markdown
## Simplification Complete

**Final metrics:**
- Words: [count] ([X]% reduction)
- Sentences: [count] ([Y]% reduction)
- Avg sentence length: [count] words (was [old])
- Code examples: [count] (was [old])

**Readability improved:** [Yes/No]
**Accuracy preserved:** [Yes/No]
```

## Common Simplification Patterns

### Pattern 1: Remove Preamble
```markdown
# Before
Before we dive into the details of how to configure your flows, it's important to understand that pgflow provides a flexible configuration system that allows you to...

# After
Configure flows using these options:
```

### Pattern 2: Combine Short Sections
```markdown
# Before
## Section 1
One paragraph.

## Section 2
One paragraph.

## Section 3
One paragraph.

# After
## Combined Topic
- Point from section 1
- Point from section 2
- Point from section 3
```

### Pattern 3: Extract to Reference
```markdown
# Before (in how-to guide)
Detailed explanation of every configuration option with types, defaults, constraints...

# After
See [Configuration Reference](/reference/configuration/) for all options.

This guide shows common patterns:
```

### Pattern 4: Replace Examples with Description
```markdown
# Before
Here's example 1 (10 lines)...
Here's example 2 (10 lines)...
Here's example 3 (10 lines)...

# After
Common patterns:
- Pattern 1: [description]
- Pattern 2: [description]

Example:
[One clear example, 10 lines]
```

## Simplification Guidelines

### DO:
- Remove redundancy ruthlessly
- Use active voice
- Front-load conclusions
- Prefer lists over paragraphs
- Use tables for comparisons
- Show minimal working examples
- Link to detail instead of including
- Use "you" in instructions, not "we"

### DON'T:
- Remove essential technical details
- Sacrifice accuracy for brevity
- Cut examples entirely (users need them)
- Remove all explanation (some context needed)
- Make sentences too terse (clarity matters)
- Remove prerequisites or warnings

## Target Word Reductions

**Good simplification:**
- Verbose docs (>300 lines): Target 30-40% reduction
- Medium docs (150-300 lines): Target 15-25% reduction
- Concise docs (<150 lines): Target 5-10% reduction

**Red flags:**
- If reducing by >50%, may be removing too much
- If reducing by <10% on verbose doc, may be too timid

## Important Reminders

- **Clarity > Brevity** - Never sacrifice understanding for word count
- **Accuracy is sacred** - Double-check technical details
- **MVP mindset** - Focus on core value, cut nice-to-haves
- **User respect** - Users' time is valuable, don't waste it
- **Test examples** - Ensure simplified code still works
- **Preserve voice** - Keep approachable, professional tone

## Special Cases

**If document is already concise (<150 lines, <10 words/sentence):**
- Report "Document is already well-optimized"
- Suggest focusing on other issues (style, structure)

**If document needs splitting, not simplifying:**
- Mixed content causing length
- Suggest `/audit-doc` to identify violations
- May need to move content, not cut it

**If heavy technical reference:**
- Be conservative with simplification
- Completeness matters more than brevity
- Focus on structure improvements instead

## Output

Use Edit tool to apply approved simplifications.

Present clear before/after metrics showing improvement.

Confirm that accuracy and essential content are preserved.
