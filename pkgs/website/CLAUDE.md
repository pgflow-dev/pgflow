# pgflow.dev Documentation Guidelines for Claude

This file provides specific guidance to Claude Code when working with the documentation website for pgflow.

## Documentation Structure

pgflow's documentation follows the [Diátaxis framework](https://diataxis.fr/), which organizes technical documentation into four distinct types, each serving a specific user need.

## Documentation Sections

Our documentation is organized into the following sections that align with the Diátaxis framework:

### 🟢 `START HERE` (Tutorials – Learning-oriented)

> Guides new users through accomplishing their first successful outcome.

This section includes step-by-step tutorials like:
- Getting Started
- Install pgflow
- Create your first flow
- Compile flow to SQL
- Run your Flow

### 🔵 `CONCEPTS` (Conceptual – Mental models)

> Explains the underlying ideas and paradigms of pgflow.

This section helps users build mental models about:
- Overview (What is pgflow?)
- Understanding the Flow DSL
- Flow vs Task thinking
- Data dependencies and DAGs

### 🟠 `HOW IT WORKS` (Explanation – System internals)

> Explains how pgflow functions under the hood, its architecture, and execution model.

This section covers technical explanations like:
- Architecture Overview
- Step Execution Lifecycle
- SQL Compilation & Migration
- Supabase Edge Integration
- Retry & Concurrency Model

### 🔵 `VS` (Conceptual – Evaluative understanding)

> Helps users conceptually compare pgflow to alternatives. Supports decision-making.

This section compares pgflow to other workflow engines:
- pgflow vs DBOS
- pgflow vs Trigger.dev
- pgflow vs Inngest

### 🟢 `HOW TO` (Tutorials – Procedural guides)

> Step-by-step instructions for specific tasks or configurations.

This section provides guides for common tasks:
- Monitor flow execution
- Organize Flows code
- Create Reusable Tasks
- Update Flow Options
- Version your flows
- Deploy to Supabase.com

### 🔴 `REFERENCE` (Reference – Precise information)

> Canonical reference material with no explanation—just facts and specs.

This section includes technical references:
- SQL Schema (internal tables, views, triggers)
- Flow Definition API (DSL reference)
- Environment Variables & Config Options

## Documentation Style Guide

Based on analysis of the existing documentation, follow these patterns when creating or updating content:

### Frontmatter Structure

Every documentation page should include proper frontmatter:

```yaml
---
title: Page Title
description: A concise one-line description of the content
sidebar:
  order: 10  # Controls sidebar position (lower numbers appear higher)
---
```

### Component Imports

Import standard Starlight components at the top of the file:

```jsx
import { Aside, Steps, TabItem, Tabs } from "@astrojs/starlight/components";
import { FileTree } from '@astrojs/starlight/components';
import NotProductionReady from '@/components/NotProductionReady.astro';
```

### Writing Style

Follow these consistent style patterns:

1. **Voice and Tone**:
   - Use direct, conversational tone
   - Second-person perspective ("you") when addressing the reader
   - Present tense for most explanations
   - Active voice rather than passive

2. **Technical Emphasis**:
   - Highlight important terms with **bold text** for emphasis
   - Use `code formatting` for code terms, file names, variables
   - Use sensible headings (H2, H3) to organize content
   - Include concise code examples with syntax highlighting

3. **Paragraphs and Lists**:
   - Keep paragraphs short (2-4 sentences)
   - Use bulleted lists for collections of related points
   - Use numbered lists for sequential steps
   - Separate distinct topics with clear headings

4. **URL Formatting**:
   - **ALWAYS use trailing slashes** in URLs (`/getting-started/install-pgflow/` NOT `/getting-started/install-pgflow`)
   - This is enforced by the site's configuration (`trailingSlash: 'always'` in astro.config.mjs)
   - Use absolute paths starting with `/` for internal links
   - Include the full URL with https:// for external links

### Common Components Usage

#### Admonitions (Aside)

Use Aside components to highlight important information:

```jsx
<Aside type="caution" title="Prerequisites">
  - Required items or warnings go here
</Aside>
```

Available types:
- `note` (blue) - Additional information
- `tip` (green) - Helpful suggestions
- `caution` (yellow) - Important warnings
- `danger` (red) - Critical warnings

#### Steps Component

For sequential tutorials, use the Steps component:

```jsx
<Steps>
  1. First step description
  
  2. Second step description
  
  3. Third step description
</Steps>
```

#### File Trees

When showing directory structures:

```jsx
<FileTree>
- supabase
  - functions
    - _tasks
      - scrapeWebsite.ts
    - _flows
      - analyze_website.ts
</FileTree>
```

#### Code Blocks

Code examples should use syntax highlighting and frames:

````jsx
```typescript
// Code goes here
const example = "Highlighted code";
```
````

For bash commands, use `frame="none"` to remove the frame and copy button:

````jsx
```bash frame="none"
npx pgflow@latest install
```
````

For highlighting specific parts of code, use line highlighting:

````jsx
```typescript {1-3,5} "highlightedTerm"
// Highlighted lines and terms
const highlighted = true;
```
````

#### Tables

Use markdown tables for comparing features:

```markdown
| Feature | pgflow | Alternative |
|---------|--------|-------------|
| Feature 1 | Value | Value |
| Feature 2 | Value | Value |
```

### Special Components

#### NotProductionReady Banner

For any page discussing features that aren't production ready:

```jsx
<NotProductionReady />
```

### Content Patterns

#### Sequenced Tutorials Structure

Based on the `install-pgflow.mdx` example, follow this pattern for tutorial documentation:

1. **Opening Context**: Start with 1-2 sentences explaining what will be accomplished
   ```markdown
   Let's set up pgflow in your Supabase project. This setup needs to be done only once per project.
   ```

2. **Prerequisites**: Use an Aside component to list required tools or setups
   ```jsx
   <Aside type="caution" title="Prerequisites">
   - Supabase CLI version **2.0.2** or higher (check with `supabase -v`)
   - A local Supabase project set up
   - [Deno version **1.45.2**](https://github.com/denoland/deno/releases/tag/v1.44.2) (required for flow compilation)
   
   If you haven't installed the CLI yet or need to upgrade, see Supabase's [installation guide](https://supabase.com/docs/guides/cli).
   </Aside>
   ```

3. **Numbered Step Headings**: Use H3 headings with numbers for major steps
   ```markdown
   ### 1. Install pgflow
   
   ### 2. Apply configuration changes
   
   ### 3. Apply migrations
   ```

4. **Command Blocks**: Show commands without frames for easy copying
   ```markdown
   ```bash frame="none"
   npx pgflow@latest install
   ```
   ```

5. **Explanatory Lists**: After command blocks, use bullet points to explain what happens
   ```markdown
   The installer will:
   - Detect your Supabase project automatically or allow you to specify it manually
   - Update your `config.toml` to enable connection pooling
   - Copy the required migrations to your migrations folder
   ```

6. **Additional Context**: Use H4 headings and Aside components for supplementary information
   ```markdown
   #### What was installed?
   
   <Aside type="note" title="About migrations">
   When installing or upgrading pgflow, migrations are copied with special timestamp prefixes that ensure they:
   - Run after your existing project migrations
   - Won't conflict with your own migrations
   </Aside>
   ```

7. **Conclusion**: End with a confirmation of completion
   ```markdown
   Your Supabase project now has everything needed to create and run workflows with pgflow!
   ```

#### How-to Guides

1. Start with the specific problem being solved
2. Provide direct steps or code samples
3. Explain any options or variations
4. Include expected outcomes

#### Explanations

1. Start with a high-level overview of the concept
2. Break down complex ideas into smaller sections
3. Use code examples to illustrate concepts
4. Connect theory to practical implementation
5. Summarize key takeaways at the end

#### Comparison Pages

1. Start with a feature comparison table
2. Include sections on when to choose each option
3. Provide code examples showing the differences
4. Include integration considerations with Supabase

### Code Examples

Code examples should follow these patterns:

1. **Concise and Focused**:
   - Demonstrate one concept at a time
   - Remove unnecessary code or comments
   - Use clear variable names

2. **Highlighting Key Portions**:
   - Use line highlighting to draw attention to important parts
   - Use string highlighting to emphasize specific terms

3. **Commenting Style**:
   - Use comments to explain non-obvious parts
   - Keep comments concise

4. **Display Conventions**:
   - Highlight important parts with `{1-3}` line markers
   - Use descriptive titles with the `title="filename.ts"` attribute

### Documentation Principles

When contributing to pgflow documentation, always keep these principles in mind:

1. **Postgres-first mindset** - All explanations should emphasize the database-centric nature
2. **Three-layer clarity** - Clear separation of DSL, SQL Core, and Edge Worker concepts
3. **Progressive disclosure** - Start with simple concepts before introducing advanced topics
4. **Code examples** - Demonstrate real-world usage aligned with design philosophy
5. **Cross-reference related content** - Link between tutorials, how-tos, explanations, and references

## Identifying Documentation Type

When creating or editing documentation content, consider which question the content answers:
- If it helps someone **learn by doing** → It's a Tutorial
- If it helps someone **solve a specific problem** → It's a How-to Guide
- If it helps someone **understand a concept** → It's an Explanation
- If it provides **precise technical information** → It's a Reference

## Implementation Notes

- Documentation is built with Astro and Starlight
- Files are in Markdown/MDX format
- The website is deployed to pgflow.dev
- For technical Astro setup details, see ASTRO_README.md

### Managing Page Redirects

When moving or renaming documentation pages, always set up redirects to maintain historical links and prevent broken links:

1. **Verify Page History Before Moving**:
   - Before moving/renaming a page, check if it already exists in the main branch:
     ```bash
     git diff main -- path/to/file.mdx
     ```
   - If the file exists in main but is being moved in your branch, add a redirect
   - New pages (not in main branch) don't need redirects

2. **Add Redirects to Configuration**:
   - Add entries to the `redirects` object in `astro.config.mjs`
   - Always include trailing slashes in both source and destination paths
   - Example:
   ```javascript
   redirects: {
     '/old-path/page-name/': '/new-path/page-name/',
     '/edge-worker/how-to/run-on-hosted-supabase/': '/how-to/deploy-to-supabasecom/',
   },
   ```

3. **When to Add Redirects**:
   - When moving a page to a different section
   - When renaming a page or section
   - When consolidating multiple pages
   - When restructuring documentation hierarchy

4. **Redirect Best Practices**:
   - Test redirects after deployment
   - Use consistent URL formatting with trailing slashes
   - Keep redirects in place indefinitely to avoid breaking external links

## MDX Headings

⚠️ **IMPORTANT**: Never add top-level headings (# Heading) in MDX files for documentation. The title from the frontmatter will automatically be inserted as a top-level heading by Starlight. Start your content directly or with second-level headings (## Heading) instead.