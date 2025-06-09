# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@.claude/think_tool.md
@.claude/nx_mcp.md
@.claude/naming_convention.md
@.claude/mvp_status.md
@.claude/codebase.md
@.claude/diataxis.md
@.claude/advanced_ai.md
@.claude/build_test_commands.md
@.claude/code_style.md

## MCP Tools for Web Reading/Crawling

For reading and crawling web content, Claude Code has access to an MCP server that provides enhanced web capabilities:

- **MCP Server**: crawl4ai-sse at http://localhost:11235/mcp/sse
- **Usage**: When you need to read web content or crawl websites, use the MCP tools instead of the standard WebFetch
- **Benefits**: The MCP tools provide more robust capabilities for web content extraction and processing

> [!WARNING]
> QUOTE ALL THE FILE PATHS THAT CONTAIN SPECIAL CHARACTERS LIKE '[run_id]'
> BECAUSE BRACKETS HAVE SPECIAL MEANING IN BASH!
> Do this: `cat 'some/path/to/[id]/page.tsx'` instead of `cat some/path/to/[id]/page.tsx`
