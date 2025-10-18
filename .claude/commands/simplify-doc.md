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

### Step 1: Analyze Document

Read the target document and measure:
- Total word count
- Number of sentences
- Average sentence length
- Number of sections and code examples

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

Analyze for these patterns:
1. **Redundancy** - Repetitive explanations, duplicate information
2. **Verbosity** - Long sentences (>25 words), unnecessary qualifiers, passive voice
3. **Over-explanation** - Explaining obvious things, too much context
4. **Poor structure** - Buried lede, rambling paragraphs, missing scanning aids
5. **Code bloat** - Examples too long, excessive comments

Present findings:
```markdown
## Simplification Opportunities

**Redundancy:** [count] instances
**Verbosity:** [count] sentences to shorten
**Over-explanation:** [count] sections to trim
**Structure:** [improvements needed]
**Code:** [count] examples to simplify

**Target reduction:** [X]% fewer words
```

**WAIT for user confirmation on which simplifications to apply.**

### Step 3: Simplify with Task Agent

**Launch a general-purpose task agent to perform simplification.**

Present the task summary to the user before launching:

```markdown
## Task Agent Instructions

I'm launching a task agent to simplify the documentation with these instructions:

**Context:**
- Target: [filename]
- Current word count: [count]
- Target reduction: [X]%
- Approved simplifications: [list from Step 2]

**Agent will:**
1. Read NOMENCLATURE_GUIDE.md for terminology standards
2. Read ARCHITECTURE_GUIDE.md for architectural accuracy
3. Read DOCS_GUIDE.md for style patterns and component usage
4. Apply approved simplifications using these techniques:
   - Remove filler words and redundancy
   - Use active voice and shorter sentences
   - Consolidate repetitive sections
   - Move excessive detail to reference docs
   - Simplify code examples (show only relevant parts)
   - Use lists/tables for better scanning
5. Preserve accuracy and essential technical content (especially terminology)
6. Maintain all working code examples
7. Keep prerequisites and warnings intact
8. Verify markdown syntax and links remain valid

**Simplification techniques:**
- Sentence reduction: Remove filler, use active voice, eliminate qualifiers
- Consolidate repetition: Merge redundant paragraphs
- Trim over-explanation: Cut obvious context, link to reference for details
- Improve structure: Use lists instead of paragraphs, tables for comparisons
- Simplify code: Show only relevant parts, remove obvious comments

**Target word reductions:**
- Verbose docs (>300 lines): 30-40% reduction
- Medium docs (150-300): 15-25% reduction
- Concise docs (<150): 5-10% reduction

**Report format:**
```markdown
## Simplification Results

**Before:** [X] words, [Y] sentences
**After:** [X] words, [Y] sentences
**Reduction:** [Z]%

### Key Changes
[List major simplifications with before/after examples]

**Verification:**
- Accuracy preserved: Yes/No
- Completeness maintained: Yes/No
- Readability improved: Yes/No
```
```

**Launching agent...**

Use the Task tool with subagent_type "general-purpose" and provide:
- Target document
- Approved simplifications
- Instructions to read all guide files (NOMENCLATURE_GUIDE.md, ARCHITECTURE_GUIDE.md, DOCS_GUIDE.md)
- Instructions to preserve accuracy and completeness (especially terminology and architectural descriptions)
- Reminder to verify all changes

## Important Reminders

- **Clarity > Brevity** - Never sacrifice understanding for word count
- **Accuracy is sacred** - Double-check technical details after simplification
- **MVP mindset** - Focus on core value, cut nice-to-haves
- **Test examples** - Ensure simplified code still works

## Special Cases

**If document is already concise (<150 lines, <10 words/sentence):**
- Report "Document is already well-optimized"
- Suggest focusing on other issues (style, structure)

**If document needs splitting, not simplifying:**
- Mixed content causing length
- Suggest /split-doc instead

## Output Format

After the task agent completes, present results to the user:

```markdown
## Simplification Complete: [filename]

**Metrics:**
- Words: [count] ([X]% reduction)
- Avg sentence length: [count] words (was [old])
- Readability: Improved

**Next steps:**
- Review key changes above
- Build to verify: pnpm nx build website
- Consider /audit-doc for comprehensive review
```
