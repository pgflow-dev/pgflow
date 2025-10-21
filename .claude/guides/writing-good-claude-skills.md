# Agent Skills Best Practices Checklist

## 1. Skill Structure & File Organization

### Required Structure
- [ ] **SKILL.md file must be at the root** of the skill directory
- [ ] **YAML frontmatter must be present** with opening `---` on line 1 and closing `---` before content
- [ ] **Required frontmatter fields**: `name` and `description` (only these two fields are supported)

### Frontmatter Limits
- [ ] **Name**: 64 characters maximum
- [ ] **Description**: 1024 characters maximum
- [ ] **No tabs in YAML**: Use spaces for indentation
- [ ] **Quote special characters**: Use quotes for strings with special characters

### File Organization Pattern
```
my-skill/
├── SKILL.md              # Required: Entry point with frontmatter + core instructions
├── resources/            # Optional: Supporting documentation
│   ├── reference.md
│   ├── examples.md
│   └── checklist.txt
├── scripts/              # Optional: Executable utilities
│   └── helper.py
└── templates/            # Optional: Structured prompts or forms
    └── template.txt
```

## 2. Naming Conventions

**Note**: These are recommended patterns observed in official Anthropic examples, not strict requirements. Choose a pattern that fits your use case and be consistent.

### ✅ DO (Recommended Patterns):
- [ ] Use **gerund form** (verb + -ing): "Processing PDFs", "Analyzing Spreadsheets"
- [ ] Use **action-oriented names**: "Process PDFs", "Analyze Spreadsheets"
- [ ] Use **noun phrases**: "PDF Processing", "Spreadsheet Analysis"
- [ ] Be **specific and descriptive**: "Git Commit Messages", "Excel Data Analysis"

### ❌ DON'T:
- [ ] Use vague names: "Helper", "Utils", "Tools"
- [ ] Use overly generic names: "Documents", "Data", "Files"
- [ ] Mix naming patterns inconsistently within your skill collection

## 3. Description Best Practices

### Critical Success Factors
- [ ] **Include WHAT the skill does** (capabilities)
- [ ] **Include WHEN to use it** (trigger terms)
- [ ] **Use specific keywords** that users would mention
- [ ] **Mention file types/formats** if relevant (.pdf, .xlsx, etc.)
- [ ] **Mention domain terms** specific to the task

### ✅ GOOD Example:
```yaml
description: Extract text and tables from PDF files, fill forms, merge documents.
Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
```

### ❌ BAD Examples:
```yaml
description: For files                    # Too vague
description: Helps with data             # Too generic
description: For analyzing data          # No specific triggers
```

### Description Formula
```
[Action verbs] + [specific capabilities] + [file types/domains].
Use when [trigger scenarios] or [user mentions these terms].
```

## 4. SKILL.md Content Structure

### Recommended Sections
- [ ] **Quick Start**: Immediate, simple usage example
- [ ] **Instructions**: Clear, step-by-step guidance
- [ ] **Examples**: Concrete input/output examples
- [ ] **Best Practices**: Dos and don'ts for this skill
- [ ] **Requirements**: Dependencies, packages, or prerequisites
- [ ] **Version History** (optional): Track changes over time

### Writing Style
- [ ] Use **present tense** in instructions
- [ ] Write **step-by-step procedures** (numbered lists)
- [ ] Provide **code examples** with clear comments
- [ ] Use **forward slashes** in file paths (Unix style): `scripts/helper.py`
- [ ] Keep core SKILL.md **lean and focused**

## 5. Progressive Disclosure Strategy

### Three Levels of Loading
- [ ] **Level 1 - Metadata** (always loaded): `name` + `description` in frontmatter
- [ ] **Level 2 - Instructions** (loaded when triggered): SKILL.md body
- [ ] **Level 3+ - Resources** (loaded as needed): Additional files referenced from SKILL.md

### When to Split Content
- [ ] Split when SKILL.md becomes **too large** (>5k tokens)
- [ ] Split **mutually exclusive contexts** into separate files
- [ ] Split **advanced/rarely-used** guidance into separate files
- [ ] Reference additional files from SKILL.md: `[forms.md](forms.md)`

### ✅ DO:
```markdown
For basic extraction, use pdfplumber (shown above).

For advanced form filling, see [FORMS.md](FORMS.md).
For detailed API reference, see [REFERENCE.md](REFERENCE.md).
```

### ❌ DON'T:
- [ ] Put everything in one massive SKILL.md file
- [ ] Load rarely-used context into core instructions

## 6. Code & Scripts Best Practices

### Script Organization
- [ ] Put scripts in **`scripts/` directory**
- [ ] Make scripts **executable**: `chmod +x scripts/*.py`
- [ ] **Document whether** Claude should run scripts OR read them as reference
- [ ] Use scripts for **deterministic operations** (sorting, validation, data extraction)

### Requirements & Dependencies
- [ ] **List required packages** in description or SKILL.md
- [ ] Note that packages must be **pre-installed** in environment before use
- [ ] Claude **cannot** install packages at runtime in the code execution container
- [ ] For Claude Code: Claude may attempt to install missing packages in local development environments

### ✅ DO - Efficient Script Pattern:
```markdown
Extract form fields without loading into context:

```bash
python scripts/extract_fields.py input.pdf
```
```

### ❌ DON'T:
- [ ] Assume packages are available without listing them
- [ ] Include scripts that require network access (not available in code execution container)

## 7. Content Patterns

### Template Pattern
- [ ] Provide **strict templates** for API responses or data formats
- [ ] Provide **flexible templates** when adaptation is useful
- [ ] Use code blocks with clear formatting

### Examples Pattern
- [ ] Include **input/output pairs** for quality-dependent tasks
- [ ] Show **multiple examples** to demonstrate variety
- [ ] Examples should be **realistic and concrete**

### Conditional Workflow Pattern
- [ ] Guide Claude through **decision points**
- [ ] Use numbered steps with clear conditions
- [ ] For complex workflows, **push to separate files**

## 8. Skill Scope & Focus

### ✅ DO - One Capability Per Skill:
- [ ] "PDF form filling" ✓
- [ ] "Excel data analysis" ✓
- [ ] "Git commit messages" ✓

### ❌ DON'T - Too Broad:
- [ ] "Document processing" (split into PDF, Word, Excel skills)
- [ ] "Data tools" (split by data type or operation)
- [ ] "All Git operations" (split into focused skills)

### Composability
- [ ] Design skills to **work independently**
- [ ] Allow skills to **compose** for complex tasks
- [ ] Avoid dependencies between skills when possible

## 9. Testing & Iteration

### Start with Evaluation
- [ ] **Identify specific gaps** in agent capabilities first
- [ ] Run agent on **representative tasks** and observe struggles
- [ ] Build skills **incrementally** to address shortcomings

### Think from Claude's Perspective
- [ ] Monitor how Claude **actually uses** the skill in real scenarios
- [ ] Watch for **unexpected trajectories** or overreliance on certain contexts
- [ ] Pay attention to when skill is **not triggered** when it should be

### Iterate with Claude
- [ ] Ask Claude to **capture successful approaches** into the skill
- [ ] Ask Claude to **document common mistakes**
- [ ] Have Claude **self-reflect** when it goes off track
- [ ] Discover what context Claude **actually needs** vs. what you anticipated

### Team Testing
- [ ] Have teammates **use the skill** and provide feedback
- [ ] Check: Does skill **activate when expected**?
- [ ] Check: Are instructions **clear and actionable**?
- [ ] Check: Are there **missing examples or edge cases**?

## 10. Tool Permissions (Claude Code)

### `allowed-tools` Frontmatter
- [ ] Use to **restrict tool access** when skill is active
- [ ] Useful for **read-only skills**: `allowed-tools: Read, Grep, Glob`
- [ ] Useful for **limited scope** skills (e.g., analysis only, no file writing)
- [ ] Omit field to use **standard permission model**

### Example:
```yaml
---
name: Safe File Reader
description: Read files without making changes
allowed-tools: Read, Grep, Glob
---
```

## 11. Security Considerations

### Installation
- [ ] **Only install skills from trusted sources** (yourself or Anthropic)
- [ ] **Thoroughly audit** skills from less-trusted sources
- [ ] **Read all bundled files** before use (scripts, resources, images)

### Audit Checklist
- [ ] Review **code dependencies** for security issues
- [ ] Check for **network calls** to untrusted sources
- [ ] Look for **file access patterns** that don't match stated purpose
- [ ] Verify **tool invocations** are appropriate for skill's stated purpose
- [ ] Watch for **data exfiltration** patterns

### Red Flags
- [ ] Skills that fetch data from **external URLs** (dependencies can change)
- [ ] Operations that **don't match** the skill's description
- [ ] Unusual **file access patterns**
- [ ] Unexpected **network calls**

## 12. Distribution & Sharing

### Personal vs Project Skills
- [ ] **Personal skills**: `~/.claude/skills/` - for individual workflows
- [ ] **Project skills**: `.claude/skills/` - shared via git with team
- [ ] **Plugin skills**: Bundled with Claude Code plugins

### Recommended Distribution
- [ ] **Distribute via plugins** for best team experience
- [ ] Alternative: **Commit project skills** to git repository
- [ ] **Document skill versions** in SKILL.md for tracking changes

### Cross-Platform Considerations
- [ ] Skills uploaded to **Claude.ai don't sync** to API or Claude Code
- [ ] Skills uploaded to **API don't sync** to Claude.ai
- [ ] **Manage separately** for each surface

## 13. Common Pitfalls to Avoid

### ❌ DON'T:
- [ ] Write vague, generic descriptions that don't help Claude discover when to use the skill
- [ ] Put all content in one massive SKILL.md (use progressive disclosure)
- [ ] Assume packages/dependencies are available without listing them
- [ ] Use Windows-style paths (`scripts\helper.py`) - use Unix style (`scripts/helper.py`)
- [ ] Create overly broad skills that try to do everything
- [ ] Skip testing with real usage scenarios
- [ ] Install skills from untrusted sources without thorough audit
- [ ] Use tabs in YAML frontmatter (use spaces)
- [ ] Forget to include trigger terms in description
- [ ] Reference files that don't exist in the skill directory

### ✅ DO:
- [ ] Write specific descriptions with clear trigger terms
- [ ] Use progressive disclosure (split large content across files)
- [ ] List all requirements and dependencies explicitly
- [ ] Use Unix-style forward slashes in all paths
- [ ] Keep skills focused on one capability
- [ ] Test with representative tasks and iterate
- [ ] Only use skills from trusted sources
- [ ] Use spaces for YAML indentation
- [ ] Include both "what" and "when" in descriptions
- [ ] Verify all file references are correct

## 14. Debugging Checklist

### If Claude Doesn't Use Your Skill:
- [ ] Is description **specific enough** with trigger terms?
- [ ] Is **YAML frontmatter valid**? (check `cat SKILL.md | head -n 15`)
- [ ] Is skill in **correct location**? (`~/.claude/skills/` or `.claude/skills/`)
- [ ] Does `SKILL.md` file exist at root of skill directory?
- [ ] Run with **debug mode**: `claude --debug`

### If Skill Has Errors:
- [ ] Are **dependencies available**?
- [ ] Do scripts have **execute permissions**? (`chmod +x scripts/*.py`)
- [ ] Are **file paths correct** with forward slashes?
- [ ] Is YAML syntax valid (no tabs, proper indentation)?

### If Multiple Skills Conflict:
- [ ] Use **distinct trigger terms** in each description
- [ ] Make descriptions **specific to use cases**
- [ ] Avoid overlapping capabilities

## Quick Reference: Skill Quality Checklist

✅ **Excellent Skill Has:**
- [ ] Specific, actionable description with clear trigger terms
- [ ] Focused scope (one capability)
- [ ] Progressive disclosure (lean core + optional deep-dive files)
- [ ] Concrete examples with input/output pairs
- [ ] Clear, step-by-step instructions
- [ ] Listed requirements/dependencies
- [ ] Tested with real usage scenarios
- [ ] Proper file organization
- [ ] Valid YAML frontmatter
- [ ] Security audit completed (if from external source)

---

**Key Principle**: Skills are like onboarding guides for new team members. They should be clear, focused, progressively detailed, and tested with real work scenarios.
