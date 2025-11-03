You are tasked with creating a new news article for the pgflow website.

## Context

Today's date (use this for article frontmatter):
<today>
!`date +%Y-%m-%d`
</today>

Recent conversation history and user arguments should guide the article creation.

User arguments:
<arguments>
$ARGUMENTS
</arguments>

Existing articles in the news directory:

<existing-articles>
!`tree pkgs/website/src/content/docs/news/`
</existing-articles>

## Multi-Step Process

<critical>
ALL user confirmations and choices MUST use AskUserQuestion tool.
Interactive buttons prevent overthinking and force clear decisions.
Never just "ask" in plain text - always use the tool.
</critical>

Follow these steps to create the article:

### Step 0: Analyze Existing Article Styles (PARALLEL)

Launch multiple Task agents in PARALLEL (use a single message with multiple Task tool calls) to analyze existing articles. Each agent should:
- Read ONE article from the existing-articles list
- Describe its writing style, tone, structure
- Note the flow of sections and content organization
- Identify common patterns in code examples and explanations

After all agents complete, synthesize their findings to guide your writing.

### Step 1: Understand the Context

Review the recent conversation history and user arguments to understand:
- What triggered the need for this article
- What features, changes, or concepts need to be explained
- Who the target audience is
- What problem or question the article addresses

### Step 2: Confirm Article Style and Focus (via AskUserQuestion tool)

Analyze the context and infer what type of article this should be. Then use AskUserQuestion to confirm:

**Step 2.1**: Determine article style/length based on context:
```
question: "What style of article should this be?"
header: "Style"
options:
  - label: "Quick Update"
    description: "Short announcement - bugfix, minor feature, or small improvement (500-800 words)"
  - label: "Feature Article"
    description: "Medium-depth coverage of new feature with examples and use cases (1000-1500 words)"
  - label: "Release Announcement"
    description: "Major version/update with breaking changes, migration guide, multiple features (1500-2500 words)"
  - label: "Deep Dive"
    description: "Technical exploration of concept, design decision, or architectural choice (2000+ words)"
multiSelect: false
```

**Step 2.2**: Review conversation history and arguments to infer:
- Main topic or angle
- Scope of coverage
- Key points to emphasize
- Target audience

**Step 2.3**: Use AskUserQuestion with inferred focus:
```
question: "What should this article focus on?"
header: "Focus"
options:
  - [Inferred topic from context, e.g., "New feature X with use cases"]
  - [Alternative angle if applicable, e.g., "Breaking change Y and migration guide"]
multiSelect: false
```

If target audience is unclear, follow with:
```
question: "Who is the target audience?"
header: "Audience"
options:
  - "New users getting started"
  - "Existing users upgrading"
  - "Advanced users seeking deep technical details"
multiSelect: false
```

### Step 3: Create Topics List (via AskUserQuestion tool)

**CRITICAL: ALWAYS write the topics list to the screen FIRST before asking for confirmation.**

Create a list of topics/points to cover in the article. Present it as an a/b/c/d list:

a) First topic
b) Second topic
c) Third topic
d) Fourth topic

**Write this list in your message text BEFORE using AskUserQuestion.**

Then use AskUserQuestion to confirm:
```
question: "Does this topics list cover everything?"
header: "Topics OK?"
options:
  - label: "Yes, looks good"
    description: "All necessary topics are covered"
  - label: "Needs changes"
    description: "Remove, add, or reorder topics"
multiSelect: false
```

If "Needs changes", ask for specific edits in plain text, update the list, and ask again until confirmed.

### Step 4: Suggest Outline (via AskUserQuestion tool)

**CRITICAL: ALWAYS write the full outline to the screen FIRST before asking for confirmation.**

Create a high-level outline using H2 and H3 headings. Include placeholders for specific content types:
- `<code snippet for X>`
- `<warning about Y>`
- `<example of Z>`
- `<comparison table>`
- `<diagram/visual>`

**Write the complete outline in your message text BEFORE using AskUserQuestion.**

Then use AskUserQuestion to confirm:
```
question: "Does this outline structure work?"
header: "Outline OK?"
options:
  - label: "Yes, proceed"
    description: "Structure and flow look good"
  - label: "Needs adjustments"
    description: "Reorganize, add, or remove sections"
multiSelect: false
```

If "Needs adjustments", ask for specific changes in plain text, update the outline, and ask again until confirmed.

### Step 5: Suggest Title (via AskUserQuestion tool)

**CRITICAL: ALWAYS write the title options to the screen FIRST before asking for confirmation.**

Generate 2-3 concise, descriptive title options. Follow the pattern from existing articles (e.g., "pgflow 0.6.1: Worker Configuration in Handler Context").

**Write all title options in your message text BEFORE using AskUserQuestion.**

Use AskUserQuestion to select:
```
question: "Which title works best?"
header: "Title"
options:
  - label: "Option 1"
    description: "[First title suggestion]"
  - label: "Option 2"
    description: "[Second title suggestion]"
  - label: "Option 3"
    description: "[Third title suggestion]"
  - label: "Custom"
    description: "I'll provide my own title"
multiSelect: false
```

If "Custom", accept user's title suggestion.

### Step 6: Describe Cover Image (via AskUserQuestion tool)

Use AskUserQuestion to decide if cover image is needed:
```
question: "Should this article have a cover image?"
header: "Cover?"
options:
  - label: "Yes"
    description: "Article would benefit from visual representation"
  - label: "No"
    description: "Skip cover image for now"
multiSelect: false
```

If "Yes", describe a scene that is:
- Cyberpunk-themed OR involves robots/automation/hackers
- Uses colors from the dark mode palette:
  - Deep teal (accent-low): #002b26
  - Teal (accent): #007b6e
  - Light teal (accent-high): #a3d4cb
  - Dark gray: #182b28, #2a3d39
  - Near-black: #121a19

Reference colors by name (e.g., "deep teal background with light teal accents") without hex codes.

Example: "A cyberpunk database server glowing with teal circuits, surrounded by flowing data streams in deep teal and light teal, against a near-black background with dark gray geometric patterns."

**CRITICAL: ALWAYS write the full cover image description to the screen FIRST before asking for confirmation.**

**Write the complete description in your message text BEFORE using AskUserQuestion.**

Present the description and ask for confirmation using AskUserQuestion:
```
question: "Does this cover image description work?"
header: "Image OK?"
options:
  - label: "Yes"
    description: "Description captures the article theme"
  - label: "Revise"
    description: "Adjust the description"
multiSelect: false
```

### Step 7: Write the Article (via AskUserQuestion tool)

Before writing, confirm with the user:
```
question: "Ready to write the article?"
header: "Write?"
options:
  - label: "Yes, write it"
    description: "All planning confirmed, proceed with article creation"
  - label: "Wait"
    description: "Need to adjust something first"
multiSelect: false
```

If "Yes, write it", write the article to `pkgs/website/src/content/docs/news/<slug>.mdx` where `<slug>` is derived from the title (lowercase, hyphenated).

**Article Requirements:**

1. **Frontmatter** - Include all required fields:
   ```yaml
   ---
   draft: false
   title: 'Article Title'
   description: 'Concise one-line description'
   date: YYYY-MM-DD
   authors:
     - jumski
   tags:
     - relevant
     - tags
   featured: true  # or false
   cover:
     alt: 'Cover image alt text'
     image: '../../../assets/cover-images/<slug>.png'
   ---
   ```

2. **Imports** - Add necessary component imports:
   ```jsx
   import { Aside } from "@astrojs/starlight/components";
   ```

3. **Content Structure:**
   - Opening paragraph (1-2 sentences summarizing the article)
   - Clear H2/H3 section hierarchy
   - Concise, explicit writing - avoid verbose explanations
   - Use `<details><summary>` blocks for implementation details or technicalities
   - Code snippets that demonstrate concepts accurately
   - Links to related documentation using proper paths with trailing slashes

4. **Writing Style:**
   - Be concise and explicit
   - Avoid overly verbose explanations
   - Use impersonal, factual language for technical concepts
   - Use "you" only when directly instructing the reader
   - Focus on what the system does, not who is doing it
   - Wrap technical depth in `<details><summary>` blocks

5. **Code Examples:**
   - Must be accurate and reflect actual pgflow APIs/concepts
   - Read relevant docs from `pkgs/website/src/content/docs/` if needed
   - Read package READMEs from `pkgs/*/README.md` if needed
   - Use proper syntax highlighting
   - Keep examples focused and minimal

6. **Links:**
   - Always use trailing slashes in internal links
   - Use absolute paths starting with `/`
   - Example: `/concepts/context/` not `/concepts/context`

## Important Reminders

- **Read existing docs/READMEs** to ensure technical accuracy
- **Use parallel Task agents** in Step 0 for efficiency
- **Be concise** - wrap details in `<details>` blocks
- **No fancy characters** - use straight quotes, hyphens, three periods
- **Verify all code snippets** against actual pgflow APIs
- **Follow project naming**: Always use lowercase "pgflow" (except in class names: "Pgflow")

## Output Location

Write the final article to:
```
pkgs/website/src/content/docs/news/<slug-from-title>.mdx
```
