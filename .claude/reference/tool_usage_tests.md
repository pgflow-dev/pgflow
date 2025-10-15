# Tool Usage Test Cases

This file contains test scenarios for validating correct tool selection behavior. Use these to verify that tool prioritization rules are being followed.

## Test Format

Each test specifies:
- **Input:** User question/request
- **Expected Tool:** The tool(s) that should be used
- **NOT Expected:** Tools that should NOT be used
- **Reasoning:** Why this is the correct choice

---

## Category: Workspace & Project Questions

### Test 1: Project Dependencies
- **Input:** "What are the dependencies of the core package?"
- **Expected Tool:** `mcp__nx-mcp__nx_project_details` with projectName="core"
- **NOT Expected:** Read package.json, Grep, WebSearch
- **Reasoning:** Nx MCP provides structured dependency information for workspace projects

### Test 2: Workspace Structure
- **Input:** "Show me all projects in this workspace"
- **Expected Tool:** `mcp__nx-mcp__nx_workspace`
- **NOT Expected:** Read nx.json, Glob for package.json files, WebSearch
- **Reasoning:** Nx MCP has complete workspace graph with relationships

### Test 3: Build Configuration
- **Input:** "How is the dsl package built?"
- **Expected Tool:** `mcp__nx-mcp__nx_project_details` with projectName="dsl", filter="targets.build"
- **NOT Expected:** Read project.json, Read nx.json, WebSearch
- **Reasoning:** Nx MCP provides complete build target configuration

---

## Category: Library & Framework Documentation

### Test 4: React Documentation
- **Input:** "How does React useEffect work?"
- **Expected Tool:** `mcp__context7__resolve-library-id` → `mcp__context7__get-library-docs`
- **NOT Expected:** WebSearch, Perplexity Ask, URL Crawler
- **Reasoning:** Library documentation MUST use Context7 MCP first

### Test 5: Temporal Workflows
- **Input:** "Show me Temporal workflow examples"
- **Expected Tool:** `mcp__context7__resolve-library-id` → `mcp__context7__get-library-docs`
- **NOT Expected:** WebSearch, URL Crawler with temporal.io URL
- **Reasoning:** Context7 provides better structured content for library docs

### Test 6: Next.js App Router
- **Input:** "What's the Next.js App Router API?"
- **Expected Tool:** `mcp__context7__resolve-library-id` → `mcp__context7__get-library-docs`
- **NOT Expected:** Perplexity Ask, WebSearch
- **Reasoning:** This is library documentation, Context7 is mandatory

### Test 7: Unknown Library Fallback
- **Input:** "Show me documentation for some-obscure-internal-library"
- **Expected Tool Chain:**
  1. Try `mcp__context7__resolve-library-id` (fails)
  2. Then `mcp__perplexity__perplexity_search` to find docs
  3. If URL found → `mcp__crawl4ai-sse__md`
  4. If no URL → `mcp__perplexity__perplexity_ask`
- **NOT Expected:** WebSearch, skip Context7 attempt
- **Reasoning:** Must try Context7 first, then fallback chain

---

## Category: Graphite CLI

### Test 8: Graphite Stacking
- **Input:** "How do I create a stack with gt?"
- **Expected Tool:** `mcp__graphite__learn_gt`
- **NOT Expected:** WebSearch, Perplexity Search, URL Crawler
- **Reasoning:** Graphite MCP specializes in gt CLI commands

### Test 9: Graphite Branching
- **Input:** "What are the gt branching commands?"
- **Expected Tool:** `mcp__graphite__learn_gt`
- **NOT Expected:** Perplexity Ask, WebSearch
- **Reasoning:** Specific to Graphite CLI tool

---

## Category: Generic Search & Information

### Test 10: Finding Resources (Explicit Search Signal)
- **Input:** "Find postgres advisory locks tutorials"
- **Expected Tool:** `mcp__perplexity__perplexity_search` with `max_results: 3`, `max_tokens_per_page: 512`
- **NOT Expected:** WebSearch, Context7 MCP, Direct answer, Default parameters (max_results: 10)
- **Reasoning:** "Find" is explicit search signal, use Perplexity Search with limited results to avoid context bloat

### Test 11: Best Practices (No Search Signal - Answer Directly)
- **Input:** "What are best practices for database migrations?"
- **Expected Tool:** NONE - Answer from training knowledge
- **NOT Expected:** Perplexity Search, WebSearch, Context7 MCP
- **Reasoning:** No explicit search signal ("find", "search", "look up"), answer directly from knowledge

### Test 12: Conversational Answer (No Tools)
- **Input:** "Explain how postgres advisory locks work"
- **Expected Tool:** NONE - Answer from training knowledge
- **NOT Expected:** Perplexity Ask, Perplexity Search, WebSearch
- **Reasoning:** No explicit search signal, standard PostgreSQL concept - answer directly

### Test 13: Search for Latest Info (Explicit Signal)
- **Input:** "Search for the latest trends in PostgreSQL 17"
- **Expected Tool:** `mcp__perplexity__perplexity_search` with `max_results: 3`, `max_tokens_per_page: 512`
- **NOT Expected:** Direct answer, WebSearch, Default parameters (max_results: 10)
- **Reasoning:** "Search" + "latest" are explicit signals for current information beyond training cutoff, limit results to avoid context bloat

---

## Category: Direct Answers (No Tools)

### Test 14: Basic Programming Concepts
- **Input:** "How do async/await work in JavaScript?"
- **Expected Tool:** NONE - Answer from training knowledge
- **NOT Expected:** Perplexity Search, Context7 MCP, WebSearch
- **Reasoning:** Standard language feature, no search signal - answer directly

### Test 15: Database Concepts
- **Input:** "What's the difference between INNER JOIN and LEFT JOIN?"
- **Expected Tool:** NONE - Answer from training knowledge
- **NOT Expected:** Perplexity Search, WebSearch
- **Reasoning:** Standard SQL concept, no search signal - answer directly

### Test 16: Design Patterns
- **Input:** "Explain the singleton pattern"
- **Expected Tool:** NONE - Answer from training knowledge
- **NOT Expected:** Perplexity Search, WebSearch
- **Reasoning:** Well-established pattern, no search signal - answer directly

---

## Category: URL Crawling

### Test 17: Explicit URL Crawl
- **Input:** "crawl https://example.com/article"
- **Expected Tool:** `mcp__crawl4ai-sse__md`
- **NOT Expected:** WebSearch, Perplexity Search
- **Reasoning:** User explicitly requested URL crawl

### Test 18: Library Docs URL (Wrong Approach)
- **Input:** "Read https://react.dev/reference/react/useEffect"
- **Expected Tool:** `mcp__context7__resolve-library-id` → `mcp__context7__get-library-docs`
- **NOT Expected:** URL Crawler (as first choice)
- **Reasoning:** Even with URL, library docs should use Context7 first for better content

### Test 19: Found URL from Search
- **Input:** (After Perplexity Search found a URL)
- **Expected Tool:** `mcp__crawl4ai-sse__md` to read the found URL
- **NOT Expected:** WebSearch
- **Reasoning:** URL Crawler is the right tool for reading found URLs

---

## Category: Deep Research

### Test 20: Comprehensive Research Request
- **Input:** "I need comprehensive research on database migration strategies"
- **Expected Action:**
  1. Extract core question: "database migration strategies"
  2. Create comprehensive query with key terms
  3. URL-encode: `database%20migration%20strategies%20best%20practices%20comparison%20tools`
  4. Open Firefox: `firefox "https://perplexity.ai/?q=database%20migration%20strategies%20best%20practices%20comparison%20tools" &`
- **NOT Expected:** `mcp__perplexity__perplexity_research` (PROHIBITED), write to file
- **Reasoning:** "research" is explicit signal, open Firefox with Perplexity instead of using prohibited tool

### Test 21: User Says "research"
- **Input:** "research microservices patterns"
- **Expected Action:** Open Firefox with Perplexity: `firefox "https://perplexity.ai/?q=microservices%20patterns%20best%20practices%20comparison%20alternatives" &`
- **NOT Expected:** `mcp__perplexity__perplexity_research`, write to file
- **Reasoning:** User shorthand "research" means open Firefox with Perplexity

---

## Category: Complex Problem Solving

### Test 22: Multi-Step Analysis
- **Input:** "Help me decide between row-level locking and advisory locks for my use case"
- **Expected Tool:** `mcp__sequentialthinking__sequentialthinking`
- **NOT Expected:** Immediate Perplexity Ask, WebSearch, Direct answer
- **Reasoning:** Complex trade-off analysis requiring structured thinking

### Test 23: Architectural Decision
- **Input:** "Should I use a monorepo or separate repos for this project?"
- **Expected Tool:** `mcp__sequentialthinking__sequentialthinking`
- **NOT Expected:** Direct answer without analysis
- **Reasoning:** Multi-faceted decision requiring consideration of trade-offs

---

## Category: Last Resort (WebSearch)

### Test 24: All Tools Exhausted
- **Input:** Some obscure question where:
  - Not workspace-related (Nx fails)
  - Not library docs (Context7 fails)
  - Not Graphite (Graphite MCP not relevant)
  - Has explicit "search" signal
  - Perplexity Search found nothing useful
  - Perplexity Ask provided insufficient answer
- **Expected Tool:** `WebSearch` (finally)
- **NOT Expected:** Skip previous tools
- **Reasoning:** Only use WebSearch after ALL other options exhausted

---

## Common Mistake Patterns

### Mistake 1: Jumping to WebSearch
- **Bad Pattern:** User asks library question → immediately use WebSearch
- **Correct Pattern:** Library question → Context7 MCP → (if fails) Perplexity Search → URL Crawler/Ask → (if all fail) WebSearch

### Mistake 2: Reading Config Files Directly
- **Bad Pattern:** "What's in nx.json?" → Read nx.json
- **Correct Pattern:** "What's in nx.json?" → Nx MCP (nx_workspace)

### Mistake 3: URL Crawler for Library Docs
- **Bad Pattern:** Need React docs → crawl react.dev
- **Correct Pattern:** Need React docs → Context7 MCP → (if fails) then crawl

### Mistake 4: Using Prohibited perplexity_research
- **Bad Pattern:** Need research → use perplexity_research tool
- **Correct Pattern:** Need research → open Firefox with Perplexity query

### Mistake 5: Skipping Sequential Thinking
- **Bad Pattern:** Complex architectural question → immediate answer
- **Correct Pattern:** Complex question → Sequential Thinking MCP for analysis → then answer

### Mistake 6: Using Tools for Basic Questions
- **Bad Pattern:** "What's async/await?" → Perplexity Search
- **Correct Pattern:** "What's async/await?" → Answer directly from training knowledge

### Mistake 7: Missing Explicit Search Signals
- **Bad Pattern:** "What are best practices?" → Perplexity Search
- **Correct Pattern:** "What are best practices?" → Answer directly (no "search"/"find" signal)

---

## Self-Check Questions

Before using any tool, ask:

0. **Did user explicitly ask to "search", "find", "look up", or "research"?** → If NO, consider answering directly
1. **Is this about THIS workspace?** → Use Nx MCP
2. **Is this about a library/framework API?** → Use Context7 MCP
3. **Is this about Graphite gt CLI?** → Use Graphite MCP
4. **Is this a complex multi-step problem?** → Use Sequential Thinking MCP
5. **Did user signal "search"/"find" for resources?** → Use Perplexity Search
6. **Do I have a specific URL to read?** → Use URL Crawler
7. **Did user say "research"?** → Open Firefox with Perplexity (NOT perplexity_research)
8. **Have ALL above failed AND user wants search?** → ONLY THEN use WebSearch
9. **Otherwise** → Answer directly from training knowledge
