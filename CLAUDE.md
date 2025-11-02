# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CRITICAL: Tool Selection Priority

**Default: Answer from your training knowledge WITHOUT tools.**

**Use tools ONLY when:**
- User explicitly asks to "search", "find", "look up", "research"
- Question is about THIS workspace, gt CLI, or library APIs (MCP tools)
- Need current information beyond training cutoff (January 2025)

**CRITICAL: DO NOT use WebFetch unless user explicitly provides a URL:**
- "ask for info about X" → Answer directly (NOT WebFetch)
- "tell me about X" → Answer directly (NOT WebFetch)
- WebFetch is ONLY for when user gives you a specific URL to fetch

**ALWAYS follow this hierarchy when selecting tools. Never skip steps.**

1. **Nx MCP** - Questions about THIS workspace (projects, dependencies, configs, build)
   - Tools: `mcp__nx-mcp__nx_docs`, `nx_workspace`, `nx_project_details`, `nx_generators`
   - DO NOT read nx.json/project.json files directly - use Nx MCP instead

2. **Graphite MCP** - Questions about `gt` CLI commands
   - Tool: `mcp__graphite__learn_gt`
   - CRITICAL: ANY mention of "gt" + command (stack, branch, sync, etc.) → Use Graphite MCP, NOT Perplexity!

3. **Context7 MCP** - Library/framework documentation (React, Temporal, Supabase, Next.js, etc.)
   - Tools: `mcp__context7__resolve-library-id` → `mcp__context7__get-library-docs`
   - MANDATORY for library questions - NEVER use WebSearch for library docs
   - ⚠️ **ALWAYS use token limits:** `tokens: 5000` (default), `tokens: 3000` (focused), max `tokens: 10000`
   - ⚠️ **ALWAYS provide topic parameter** to focus results (e.g., "hooks", "routing")
   - Only fallback to URL Crawler if Context7 doesn't have the library

4. **Sequential Thinking MCP** - Complex multi-step problems requiring analysis
   - Tool: `mcp__sequentialthinking__sequentialthinking`
   - Use for architectural decisions, debugging complex issues, planning refactors

5. **Perplexity Search** - Generic searches, finding resources (ONLY with explicit "search"/"find" signal)
   - Tool: `mcp__perplexity__perplexity_search`
   - MANDATORY before WebSearch for any generic search
   - ⚠️ **ALWAYS limit results:** `max_results: 3`, `max_tokens_per_page: 512` to avoid filling context

6. **Perplexity Ask** - Conversational answers when Search returns nothing useful
   - Tool: `mcp__perplexity__perplexity_ask`
   - Keep responses concise - avoid filling context unnecessarily

7. **URL Crawler** - Reading specific URLs (only after finding URL via search)
   - Tool: `mcp__crawl4ai-sse__md`

8. **WebSearch** - ABSOLUTELY FORBIDDEN unless ALL above tools exhausted
   - Only use after: Nx MCP, Graphite MCP, Context7 MCP, Sequential Thinking, Perplexity Search, Perplexity Ask all failed

### Deep Research Requirement

**NEVER use `mcp__perplexity__perplexity_research` - it is PROHIBITED.**

If you need comprehensive research:
1. Extract core research question with key terms
2. URL-encode the query (spaces → `%20`)
3. Open Firefox with Perplexity: `firefox "https://perplexity.ai/?q=<encoded-query>" &`

Example:
```bash
firefox "https://perplexity.ai/?q=postgres%20advisory%20locks%20vs%20row%20locking%20comparison%20trade-offs" &
```

See @.claude/core/finding_answers.md for complete decision tree and examples.

---

@.claude/core/codebase.md
@.claude/core/mvp_status.md
@.claude/core/packages.md
@.claude/core/finding_answers.md
@.claude/core/code_style.md
@.claude/core/testing_guidelines.md
@.claude/core/build_test_commands.md
@.claude/core/naming_convention.md
@.claude/core/character_guidelines.md
@.claude/core/diataxis.md

## Development Guidelines

- Always run 'nx' as 'pnpm nx'