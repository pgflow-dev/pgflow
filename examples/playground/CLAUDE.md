# CLAUDE.md

> [!WARNING]
> QUOTE ALL THE FILE PATHS THAT CONTAIN ROUTE PARAMETERS LIKE '[run_id]'
> BECAUSE BRACKETS HAVE SPECIAL MEANING IN BASH!
> Do this: `cat 'some/path/to/[id]/page.tsx'` instead of `cat some/path/to/[id]/page.tsx`

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build/Run Commands

- `npm run build` - Build the application
- `npm run gen-types` - Generate TypeScript types from Supabase schema

## Code Style Guidelines

- **TypeScript**: Use strict mode with proper type annotations
- **Imports**: Use `@/` alias prefix for project imports (e.g., `@/components/ui/button`)
- **Components**: Follow React Server Component patterns with proper props typing
- **Formatting**: Project uses Prettier with default settings
- **UI**: Uses shadcn/ui component library with Tailwind CSS
- **Next.js**: Follow App Router conventions with page.tsx for routes
- **Error Handling**: Use proper error boundaries and form validation
- **Database**: Use Supabase for backend with Edge Functions
- **Naming**: Use PascalCase for components, camelCase for variables/functions
- **File Structure**: Group related components in dedicated folders

## Application Purpose & Design Philosophy

This application serves a dual purpose:

1. **Functional Showcase**: A clean, intuitive UI that demonstrates pgflow's capabilities in action. While this aspect is somewhat secondary, it provides necessary context and delivers a complete end-user experience.

2. **Execution Observatory**: The primary focus - a comprehensive, live-updating visibility platform for workflow execution. This implements the "glass box" approach to observability, giving developers unprecedented insight into exactly what's happening during flow runs.

### UX Approach & Methodologies

The application design follows several established UX principles:

- **Progressive Disclosure**: Information is layered, with high-level status visible immediately and detailed execution data available on demand
  - _Example: Flow status shown at a glance, with step-by-step execution details expandable on click_
- **Contextual Instrumentation**: Monitoring is integrated directly into the execution environment rather than bolted on afterward
  - _Example: Task timing, memory usage, and database operations captured at their source_
- **Real-Time Feedback Loops**: Following the principles of "Continuous Feedback" from DevOps methodologies
  - _Example: Live updates when tasks complete, fail, or encounter bottlenecks_
- **Mental Model Alignment**: The visualization of flow execution matches the conceptual structure of how the flows are defined in code
  - _Example: Parent-child task relationships and execution order visually mirror the flow definition_
- **Diagnostic-First Design**: Unlike traditional "black box" systems, pgflow embraces transparency as a core design principle, similar to the "Observability-Driven Development" approach
  - _Example: Error states expose detailed context, parameters, and execution history for rapid debugging_
