You are tasked with auditing documentation for compliance with pgflow guidelines, Diataxis framework, and identifying quality issues.

## Context

Documentation root: `pkgs/website/src/content/docs/`

Target for audit:
<target>
$ARGUMENTS
</target>

## Process

### Step 1: Identify Scope

**If specific file provided:**
- Audit that single file

**If directory provided:**
- Audit all .mdx files in that directory

**If "all" or no argument:**
- Ask user to confirm scope (this could be large)
- Suggest starting with specific section

Present scope and WAIT for confirmation.

### Step 2: Perform Comprehensive Audit

For each file, check these categories:

## Audit Categories

### 1. DIATAXIS COMPLIANCE (Critical)

Determine the file's location and intended type:
- `get-started/`, `tutorials/` → **Tutorial**
- `develop/`, `operate/` → **How-to Guide**
- `concepts/`, `comparisons/` → **Explanation**
- `reference/` → **Reference**

**Check for violations:**

**Tutorial violations:**
- [ ] Contains explanatory content that should be in concepts
- [ ] Includes reference material (API specs, option tables)
- [ ] Has branching "if/else" scenarios (tutorials should be linear)
- [ ] Lacks step-by-step structure
- [ ] Missing expected outcomes for steps

**How-to violations:**
- [ ] Teaching basics from scratch (should assume knowledge)
- [ ] Contains conceptual explanations (should link to concepts)
- [ ] Not problem-focused
- [ ] Includes reference tables

**Explanation violations:**
- [ ] Contains step-by-step instructions
- [ ] Has code examples meant to be followed
- [ ] Uses directive language ("Now do this...")
- [ ] Includes how-to content

**Reference violations:**
- [ ] Contains explanations of concepts
- [ ] Has step-by-step examples
- [ ] Uses prescriptive language ("you should...")
- [ ] Missing specifications (incomplete option list)

### 2. STYLE COMPLIANCE

**Character issues:**
- [ ] Em-dashes (—) instead of hyphens (-)
- [ ] Curly quotes ("") instead of straight ("")
- [ ] Curly apostrophes (') instead of straight (')
- [ ] Ellipsis (…) instead of three periods (...)
- [ ] Non-breaking spaces

**Naming convention:**
- [ ] "PgFlow", "pgFlow", "PGFlow" (should be "pgflow")
- [ ] Exception: "Pgflow" in class names is okay

**Voice/perspective:**
- [ ] Uses "we", "our" in technical descriptions
- [ ] Uses "let's" unnecessarily
- [ ] Inconsistent use of "you"

**Links:**
- [ ] Missing trailing slashes on internal links
- [ ] Relative paths instead of absolute
- [ ] "Click here" or non-descriptive link text

### 3. STRUCTURAL ISSUES

**Frontmatter:**
- [ ] Missing title
- [ ] Missing description
- [ ] Description too long (>100 chars)

**Content structure:**
- [ ] Heading hierarchy jumps (H2 → H4)
- [ ] Inconsistent heading style
- [ ] Missing prerequisites (for tutorials/how-tos)
- [ ] No "Next Steps" section (for tutorials)
- [ ] No "Learn More" section (for how-tos)

**Code examples:**
- [ ] Missing title attributes
- [ ] No highlighting of important lines
- [ ] Commands without frame="none"
- [ ] Missing context before code blocks
- [ ] Examples too long or too complex

**Callouts/Asides:**
- [ ] More than 3 Asides (too many)
- [ ] Misuse of types (using "note" for warnings)
- [ ] Nested complex content in Asides

### 4. CONTENT QUALITY

**Clarity:**
- [ ] Verbose or redundant explanations
- [ ] Jargon without definition
- [ ] Unclear instructions
- [ ] Ambiguous references ("this", "it" without clear antecedent)

**Completeness:**
- [ ] Missing code examples where needed
- [ ] Incomplete examples
- [ ] Missing prerequisites
- [ ] No success criteria

**Accuracy:**
- [ ] Outdated information
- [ ] Incorrect commands or code
- [ ] Broken links
- [ ] References to non-existent files

**Cross-references:**
- [ ] Missing links to related content
- [ ] Links to wrong content type
- [ ] Dead-end pages (no onward navigation)

### 5. LENGTH AND DEPTH

Check document length:
- Short: <100 lines
- Medium: 100-200 lines
- Long: 200-300 lines
- Very long: >300 lines

**Issues:**
- [ ] Very long documents (>300 lines) - suggest splitting
- [ ] Reference pages that are too long - should be modular
- [ ] Tutorial steps that are too long - suggest breaking up

## Audit Report Format

Present findings in this structured format:

```markdown
# Audit Report: [filename]

**Location:** pkgs/website/src/content/docs/[path]
**Intended Type:** [Tutorial/How-to/Explanation/Reference]
**Length:** [count] lines ([Short/Medium/Long/Very Long])

## 🔴 CRITICAL ISSUES (Fix First)

### Diataxis Violations
[List any mixed content or misplaced content]

### Broken Functionality
[Broken links, incorrect code, etc.]

## 🟡 IMPORTANT ISSUES (Fix Soon)

### Style Violations
- Character issues: [count]
- Naming violations: [count]
- Voice issues: [count]

### Structural Problems
[Missing sections, heading issues, etc.]

## 🟢 IMPROVEMENTS (Nice to Have)

### Content Quality
[Verbosity, clarity, completeness]

### Cross-References
[Missing links, navigation improvements]

## SUMMARY

**Overall Assessment:** [Excellent/Good/Needs Work/Major Issues]

**Priority Actions:**
1. [Highest priority fix]
2. [Second priority fix]
3. [Third priority fix]

**Suggested Commands:**
- [Command to run for quick fixes, e.g., `/fix-doc-style`]
- [Command for improvements, e.g., `/edit-doc`]
- [Command if needs splitting, e.g., `/split-doc` (future)]
```

### Step 3: Provide Specific Examples

For each issue found, provide:
- Line number or section where issue occurs
- Example of the violation
- Suggested fix

Example:
```markdown
### Voice Violation (Line 42)
**Found:**
> "Let's create our first flow"

**Suggested:**
> "Create your first flow"
```

### Step 4: Batch Audit Summary

If auditing multiple files, provide aggregate report:

```markdown
# Batch Audit Summary

**Files Audited:** [count]

## Issue Distribution

**Critical Issues:** [count] files
- Diataxis violations: [count]
- Broken links: [count]

**Style Issues:** [count] files
- Character issues: [count]
- Voice issues: [count]

**Content Quality:** [count] files need improvement

## Files Needing Immediate Attention

1. **[filename1]** - [Critical issue summary]
2. **[filename2]** - [Critical issue summary]
...

## Files That Are Excellent
[List files with no issues - positive reinforcement!]

## Recommended Actions

1. Run `/fix-doc-style` on these files: [list]
2. Run `/edit-doc` on these files: [list]
3. Consider moving these files: [list with suggestions]
4. Consider splitting these files: [list]
```

## Quick Audit Mode

If user requests "quick audit", perform faster check:
- Diataxis compliance only
- Critical style issues only (characters, naming)
- No detailed content quality review

Present simplified report focusing on must-fix issues.

## Deep Audit Mode

If user requests "deep audit", perform comprehensive review:
- All categories above
- Read entire document carefully
- Check every code example
- Verify all links
- Assess readability and flow
- Suggest specific improvements

May take longer but provides thorough analysis.

## Comparison to Best Practices

Reference these as exemplars:
- **Good tutorial:** `/get-started/flows/create-flow.mdx`
- **Good how-to:** `/operate/deploy/deploy-first-flow.mdx`
- **Good explanation:** `/concepts/architecture/how-pgflow-works.mdx`
- **Good reference:** (none fully compliant yet, use standards above)

When auditing, compare structure and style to relevant exemplar.

## Important Reminders

- **Be specific** - Provide line numbers and examples
- **Be constructive** - Suggest fixes, not just criticism
- **Prioritize** - Critical issues first
- **Be comprehensive** - Check all categories
- **Be helpful** - Suggest which commands to run next

## Special Cases

**If file has many issues:**
- Group similar issues together
- Prioritize clearly
- May suggest complete rewrite vs. incremental fixes

**If file is excellent:**
- Say so! Positive feedback is valuable
- Note what it does well
- Suggest as exemplar for similar docs

**If unclear about intended content type:**
- Note the ambiguity
- Suggest clarifying or splitting
- Ask user for intent

## Output

Present comprehensive audit report using format above.

For batch audits, provide both aggregate summary and per-file details.

Suggest concrete next steps and commands to run.
