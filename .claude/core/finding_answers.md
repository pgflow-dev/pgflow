# Finding Answers - Decision Tree

## Quick Decision Tree

```
What am I looking for?

├─ Documentation for a tool/library?
│  ├─ This Nx workspace? → Nx MCP
│  ├─ Graphite gt CLI? → Graphite MCP
│  └─ Other library/framework? → Context7 MCP
│
├─ Content from a specific URL? → URL Crawler*
│
└─ Generic search/question? → Perplexity Search

*Check if library docs first - use Context7 instead
```

## When to Use Tools vs Answer Directly

**Default: Answer from your training knowledge WITHOUT tools.**

**ONLY use search/research tools when user explicitly signals intent:**
- "search for..."
- "find..."
- "look up..."
- "research..."
- "what's the latest..."
- "current best practices..."
- User provides a URL to crawl/fetch

**CRITICAL: DO NOT use WebFetch to fetch documentation you know about:**
- "ask for info about X" → Answer directly or use appropriate MCP (NOT WebFetch)
- "tell me about X" → Answer directly (NOT WebFetch)
- WebFetch is ONLY for when user explicitly provides a URL to fetch
- For Claude Code docs → Answer from knowledge or use URL if user provides it

**ALWAYS use MCP tools for specific systems (even without explicit "search" signal):**
- Questions about THIS workspace → Nx MCP (always)
- Questions about gt CLI → Graphite MCP (always)
- Questions about library APIs → Context7 MCP (always)

## Tool Selection Hierarchy

**ALWAYS follow this order. Never skip steps.**

| Priority | Scenario | Tool | Notes |
|----------|----------|------|-------|
| 1 | THIS workspace | Nx MCP (`nx_docs`, `nx_workspace`, `nx_project_details`) | Don't read nx.json directly |
| 2 | `gt` CLI commands | Graphite MCP (`learn_gt`) | ANY "gt" mention = use this |
| 3 | Library/framework docs | Context7 MCP (`resolve-library-id` → `get-library-docs`) | Token limits: 3k-10k, use `topic` param |
| 4 | Complex reasoning | Sequential Thinking MCP | Multi-step analysis only |
| 5 | Generic search | Perplexity Search | `max_results: 3`, `max_tokens_per_page: 512` |
| 6 | Conversational answer | Perplexity Ask | When Search returns nothing |
| 7 | Specific URL content | URL Crawler (`crawl4ai-sse__md`) | Try Context7 first for library docs |
| 8 | Deep multi-source research | Researcher agent (`/research <topic>`) | 30-50k tokens, use sparingly |
| 9 | Last resort - search | WebSearch | ONLY after Perplexity Search/Ask exhausted |
| 10 | Last resort - fetch | WebFetch | ONLY after URL Crawler exhausted |

**PROHIBITED:** `mcp__perplexity__perplexity_research` - Use researcher agent instead

**CRITICAL: WebSearch and WebFetch are last resort tools:**
- WebSearch: Use ONLY when Perplexity Search AND Perplexity Ask both failed
- WebFetch: Use ONLY when URL Crawler failed OR user explicitly provides URL to fetch

## Critical Anti-Patterns (Top 4)

Learn these mistakes to avoid them:

❌ **Library docs → WebSearch or WebFetch**
- WRONG: Use WebSearch/WebFetch for React, Temporal, etc.
- RIGHT: Use Context7 MCP first
- Why: Context7 provides structured, up-to-date library docs

❌ **"gt commands" → Perplexity Search**
- WRONG: Search for "gt stack", "gt sync", etc.
- RIGHT: Use Graphite MCP for ANY "gt" mention
- Why: Graphite MCP has complete CLI documentation

❌ **Deep research → perplexity_research tool**
- WRONG: Use `mcp__perplexity__perplexity_research`
- RIGHT: Use researcher agent (`/research <topic>`)
- Why: perplexity_research is PROHIBITED

❌ **"ask about X" → WebFetch**
- WRONG: Fetch docs when user says "ask about" or "tell me about"
- RIGHT: Answer from training knowledge (not a URL fetch request)
- Why: WebFetch is ONLY for explicit URLs provided by user

**Note:** More detailed examples available in `.claude/tool_examples.md` (user can reference when needed)

## Key Decision Rules

1. **Tool/library docs?** → Nx MCP / Graphite MCP / Context7 MCP
2. **Known URL?** → Try Context7 first (if library), else URL Crawler → WebFetch (last resort)
3. **Generic search?** → Perplexity Search → Perplexity Ask → WebSearch (last resort)
4. **Deep research?** → `/research <topic>` (researcher agent)
5. **User says "crawl [url]"?** → URL Crawler → WebFetch (if failed)
6. **User says "search [query]"?** → Perplexity Search → Perplexity Ask → WebSearch (if failed)
7. **User provides explicit URL?** → URL Crawler → WebFetch (fallback)

## Context7 MCP Quick Reference

**Token limits (always specify):**
- Focused: `tokens: 3000`
- Default: `tokens: 5000`
- Broad: `tokens: 8000`
- Maximum: `tokens: 10000`

**Always provide `topic` parameter** (e.g., "hooks", "routing", "authentication")

**Examples:**
- React hooks → `/facebook/react`, topic: "hooks", tokens: 5000
- Temporal workflows → `/temporalio/temporal`, topic: "workflows", tokens: 5000
- Supabase functions → `/supabase/supabase`, topic: "edge functions", tokens: 5000

## Perplexity Search Quick Reference

**Always limit results:**
```typescript
mcp__perplexity__perplexity_search({
  query: "your search query",
  max_results: 3,           // Default is 10 - too many!
  max_tokens_per_page: 512  // Reduce per-result content
})
```

## Researcher Agent Quick Reference

**When to use:**
- Comprehensive multi-source research needed
- Comparing approaches/technologies
- Trade-off analysis with citations

**Token cost:** 30-50k tokens per research
**Use sparingly:** Only for complex questions requiring synthesis

**Examples:**
```bash
/research postgres advisory locks vs row locking trade-offs
/research database migration strategies comparison
```

## Project-Specific Documentation URLs

**Use Context7 first, fallback to URL Crawler only if Context7 fails**

### Starlight (website framework)
- Getting Started: https://starlight.astro.build/getting-started/

### Vitest (testing framework)
- Guide: https://vitest.dev/guide/

### pgTAP (PostgreSQL testing framework)
- Documentation: https://pgtap.org/documentation.html

### PGMQ (Postgres Message Queue)
- Overview: https://pgmq.github.io/pgmq/
- Functions: https://pgmq.github.io/pgmq/api/sql/functions/
- Types: https://pgmq.github.io/pgmq/api/sql/types/

### Claude Code
- Overview: https://docs.claude.com/en/docs/claude-code/overview
