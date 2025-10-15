# Tool Usage Examples & Anti-Patterns

This file contains detailed examples and common mistakes. Reference with `@.claude/tool_examples.md` when needed.

## Detailed Tool Examples

### Context7 MCP - Detailed Usage

**Complete workflow:**
1. `mcp__context7__resolve-library-id` (find library ID)
2. `mcp__context7__get-library-docs` (fetch docs)

**Token limit guidelines:**
- Default: `tokens: 5000` (good for most queries)
- Focused query: `tokens: 3000` (specific API/method)
- Broad overview: `tokens: 8000` (architecture/patterns)
- Maximum: `tokens: 10000` (comprehensive reference, use sparingly)
- Always provide a specific `topic` parameter to focus results

**Example calls:**
```typescript
// React hooks
get-library-docs(
  context7CompatibleLibraryID: "/facebook/react",
  topic: "hooks",
  tokens: 5000
)

// Temporal workflows
get-library-docs(
  context7CompatibleLibraryID: "/temporalio/temporal",
  topic: "workflows",
  tokens: 5000
)

// Supabase Edge Functions
get-library-docs(
  context7CompatibleLibraryID: "/supabase/supabase",
  topic: "edge functions",
  tokens: 5000
)

// Next.js routing
get-library-docs(
  context7CompatibleLibraryID: "/vercel/next.js",
  topic: "routing",
  tokens: 5000
)
```

**Natural phrasings that trigger Context7:**
- "How does [library] work?"
- "Show me [library] docs/documentation"
- "What's the [library] API for...?"
- "[Library] examples"
- "Explain [library feature]"

**Fallback if Context7 doesn't have it:**
1. Use Perplexity Search to find documentation URL
2. If URL found → use URL Crawler to read it
3. If no good URL → use Perplexity Ask for answer

### Perplexity Search - Detailed Usage

**Always limit results to avoid context bloat:**
```typescript
mcp__perplexity__perplexity_search({
  query: "postgres advisory locks tutorials",
  max_results: 3,           // Default is 10 - too many!
  max_tokens_per_page: 512  // Reduce per-result content
})
```

**When to increase limits:**
- User explicitly needs comprehensive results
- Initial search with defaults found nothing useful
- Researching complex topic requiring multiple sources

### Nx MCP - Detailed Usage

**Tools available:**
- `mcp__nx-mcp__nx_docs` - Nx-specific documentation
- `mcp__nx-mcp__nx_workspace` - Workspace structure overview
- `mcp__nx-mcp__nx_project_details` - Deep dive on specific project
- `mcp__nx-mcp__nx_generators` - Available generators

**Example queries:**
- "What are the dependencies of the core package?" → `nx_project_details`
- "Show me the build configuration for dsl" → `nx_project_details`
- "How is the monorepo structured?" → `nx_workspace`
- "How does Nx caching work?" → `nx_docs`

**Important:** Query Nx MCP instead of reading nx.json/project.json files directly

### Graphite MCP - Detailed Usage

**Critical triggers - ALWAYS use Graphite MCP:**
- "gt" + any command (stack, branch, sync, etc.)
- "graphite" + CLI/command
- Specifically: "gt stack", "gt create", "gt branch", "gt sync", "gt submit", "gt log"

**Example queries:**
- "How do I create a stack with gt?" → Graphite MCP (NOT Perplexity)
- "What are gt branching commands?" → Graphite MCP (NOT Perplexity)
- "How to sync with gt?" → Graphite MCP (NOT Perplexity)
- "gt stack workflow" → Graphite MCP (NOT Perplexity)

### Researcher Agent - When to Use

**Use for:**
- Comprehensive multi-source research
- Comparing different approaches/technologies
- Deep dives requiring synthesis across sources
- Trade-off analysis with citations

**Output includes:**
- Sources Review: Each source with key findings
- Source Comparison: Agreement, conflicts, gaps
- Final Answer: Definitive synthesis
- Confidence Score: Based on source consensus

**Examples:**
```bash
/research postgres advisory locks vs row locking trade-offs
/research database migration strategies comparison
/research microservices patterns best practices
```

**Token cost warning:**
- Typical usage: 30-50k tokens
- Use sparingly for complex questions only
- For simple questions, use direct MCP tools instead

---

## Complete Anti-Pattern Examples

### ✅ CORRECT Tool Selections

**Library documentation:**
- Q: "How does Temporal workflow execution work?"
- Tool: Context7 MCP (resolve-library-id → get-library-docs)
- Why: Library documentation question

**Workspace questions:**
- Q: "What's in the core package?"
- Tool: Nx MCP (nx_project_details)
- Why: Workspace project question

**Graphite CLI:**
- Q: "How do I create a stack with gt?"
- Tool: Graphite MCP (learn_gt)
- Why: Graphite CLI question

**Generic search:**
- Q: "Find postgres migration best practices"
- Tool: Perplexity Search
- Why: Generic search for resources

**URL crawling:**
- Q: "crawl https://example.com/article"
- Tool: URL Crawler (crawl4ai-sse__md)
- Why: User explicitly requested URL crawl

**Conversational answers:**
- Q: "Explain how postgres advisory locks work"
- Tool: Perplexity Ask
- Why: Need conversational explanation, not search results

**Deep research:**
- Q: "I need comprehensive research on database migration strategies"
- Tool: Researcher agent (`/research database migration strategies`)
- Why: Deep multi-source research with synthesis needed

**Answer from knowledge:**
- Q: "How do async/await work?"
- Tool: None - answer directly
- Why: General programming concept in training data

**Answer from knowledge (Claude Code):**
- Q: "ask for info about how to create custom claude code agents"
- Tool: None - answer directly from training knowledge
- Why: "ask for info" is not "fetch URL" - Claude Code is in training data

### ❌ INCORRECT Tool Selections

**Wrong: WebSearch for library docs**
- Q: "How does React useEffect work?"
- WRONG: WebSearch
- RIGHT: Context7 MCP
- Why wrong: Library docs should ALWAYS use Context7 first

**Wrong: Reading files directly**
- Q: "What are the dependencies of the dsl package?"
- WRONG: Read package.json
- RIGHT: Nx MCP (nx_project_details)
- Why wrong: Nx MCP provides better structured data

**Wrong: URL Crawler for library docs**
- Q: "Show me the Temporal documentation"
- WRONG: URL Crawler with docs.temporal.io
- RIGHT: Context7 MCP
- Why wrong: Context7 provides better structured content

**Wrong: WebSearch before Perplexity**
- Q: "Find tutorials on postgres transactions"
- WRONG: WebSearch
- RIGHT: Perplexity Search
- Why wrong: Must try Perplexity Search before WebSearch

**Wrong: perplexity_research tool**
- Q: "I need deep research on microservices patterns"
- WRONG: mcp__perplexity__perplexity_research
- RIGHT: Researcher agent (`/research microservices patterns`)
- Why wrong: perplexity_research is PROHIBITED, use researcher agent instead

**Wrong: Reading config files directly**
- Q: "How is nx.json configured?"
- WRONG: Read nx.json
- RIGHT: Nx MCP (nx_workspace)
- Why wrong: Nx MCP provides context and explanation, not just raw file

**Wrong: Perplexity Ask for library docs**
- Q: "What's the Next.js App Router API?"
- WRONG: Perplexity Ask
- RIGHT: Context7 MCP
- Why wrong: This is library documentation, must use Context7

**Wrong: Perplexity Search for gt commands**
- Q: "How do I create a stack with gt?"
- WRONG: Perplexity Search
- RIGHT: Graphite MCP (learn_gt)
- Why wrong: "gt" is Graphite CLI tool - must use Graphite MCP

**Wrong: WebFetch without explicit URL**
- Q: "ask for info about how to create custom claude code agents"
- WRONG: WebFetch to fetch Claude Code docs
- RIGHT: Answer from training knowledge
- Why wrong: "ask for info" is not "fetch this URL" - should answer directly

---

## Tool Capabilities (Detailed)

### Nx MCP - Full Capabilities
- ✅ Can do: Workspace structure, project configs, dependencies, build targets, generators, Nx-specific docs
- ❌ Cannot do: Library documentation (use Context7), generic programming questions
- Handoff to: Context7 for library docs, Perplexity for non-Nx questions

### Graphite MCP - Full Capabilities
- ✅ Can do: `gt` CLI commands, stacking workflows, Graphite-specific operations
- ❌ Cannot do: Generic git questions, GitHub API, other git tools
- Handoff to: Perplexity Search for generic git questions

### Context7 MCP - Full Capabilities
- ✅ Can do: Library/framework documentation, API references, code examples for popular packages
- ❌ Cannot do: Generic how-to guides, blog posts, tutorials, unpopular/internal libraries
- Handoff to: Perplexity Search to find docs URL, then URL Crawler to read it

### Sequential Thinking MCP - Full Capabilities
- ✅ Can do: Multi-step reasoning, complex problem analysis, planning, trade-off evaluation
- ❌ Cannot do: Simple lookups, direct answers, research
- Handoff to: Other tools for information gathering, use this for analysis

### Perplexity Search - Full Capabilities
- ✅ Can do: Find URLs, discover resources, current events, get search results
- ❌ Cannot do: Read full page content (use URL Crawler), provide synthesized answers (use Ask)
- Handoff to: URL Crawler for content, Perplexity Ask for direct answers
- Warning: Always use `max_results: 3` and `max_tokens_per_page: 512` to avoid filling context

### Perplexity Ask - Full Capabilities
- ✅ Can do: Conversational answers, synthesize information, explain concepts
- ❌ Cannot do: Deep multi-source research (use researcher agent), library docs (use Context7)
- Handoff to: Researcher agent for comprehensive multi-source research

### URL Crawler - Full Capabilities
- ✅ Can do: Extract markdown from specific URLs, read documentation pages
- ❌ Cannot do: Find URLs (use Perplexity Search), library docs (try Context7 first)
- Handoff to: Context7 if URL is library docs, Perplexity Search to find URLs

### WebFetch - Full Capabilities
- ✅ Can do: Fetch content from a specific URL when user explicitly provides it
- ❌ Cannot do: Library docs (use Context7), general documentation (use appropriate MCP), decide which URL to fetch on your own
- Use only when: User explicitly provides a URL to fetch
- CRITICAL: Do NOT use WebFetch to fetch documentation URLs you know about

### WebSearch - Full Capabilities
- ✅ Can do: Absolute last resort searches
- ❌ Cannot do: Everything above tools can do
- Use only when: ALL other tools have been exhausted
