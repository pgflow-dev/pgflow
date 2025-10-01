You are tasked with creating a new news article for the pgflow website.

## Context

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

### Step 2: Confirm Article Focus

Ensure you understand what the article should focus on. If you have any doubts about:
- The main topic or angle
- The scope of coverage
- Key points to emphasize

Ask clarifying questions and wait for user confirmation before proceeding.

### Step 3: Create Topics List

Create a list of topics/points to cover in the article. Present it as an a/b/c/d list for easy editing:

a) First topic
b) Second topic
c) Third topic
d) Fourth topic

Allow the user to provide feedback like "remove b and d" or "add X between a and c". Iterate until the user agrees with the list.

### Step 4: Suggest Outline

Create a high-level outline using H2 and H3 headings. Include placeholders for specific content types:
- `<code snippet for X>`
- `<warning about Y>`
- `<example of Z>`
- `<comparison table>`
- `<diagram/visual>`

Present the outline to the user for review and refinement.

### Step 5: Suggest Title

Suggest a concise, descriptive title for the article. Follow the pattern from existing articles (e.g., "pgflow 0.6.1: Worker Configuration in Handler Context").

Iterate with the user until the title is confirmed.

### Step 6: Describe Cover Image (Optional)

If a cover image would enhance the article, describe a scene that is:
- Cyberpunk-themed OR involves robots/automation/hackers
- Uses colors from the dark mode palette:
  - Deep teal (accent-low): #002b26
  - Teal (accent): #007b6e
  - Light teal (accent-high): #a3d4cb
  - Dark gray: #182b28, #2a3d39
  - Near-black: #121a19

You can reference these colors by name (e.g., "deep teal background with light teal accents") without specifying hex codes.

Example: "A cyberpunk database server glowing with teal circuits, surrounded by flowing data streams in deep teal and light teal, against a near-black background with dark gray geometric patterns."

### Step 7: Write the Article

Write the article to `pkgs/website/src/content/docs/news/<slug>.mdx` where `<slug>` is derived from the title (lowercase, hyphenated).

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
