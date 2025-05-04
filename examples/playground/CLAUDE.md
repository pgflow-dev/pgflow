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

### Laws of good UX:

#### **Nielsen's 10 Heuristics:**

1. **Visibility of system status**: The system should always keep users informed about what's happening.
2. **Match between system and the real world**: The system should speak the user's language, with words, phrases, and concepts familiar to the user.
3. **User control and freedom**: Users often choose system functions by mistake and will need a clearly marked "emergency exit" to leave the unwanted state.
4. **Consistency and standards**: Users should not have to wonder whether different words, situations, or actions mean the same thing.
5. **Error prevention**: Even better than good error messages is a careful design that prevents a problem from occurring in the first place.
6. **Recognition rather than recall**: Minimize the user's memory load by making objects, actions, and options visible.
7. **Flexibility and efficiency of use**: Accelerators—unseen by the novice user—often often used by expert users such that the system can cater to both inexperienced and experienced users.
8. **Aesthetic and minimalistic design**: Dialogues should not contain information that is irrelevant or rarely needed.
9. **Help users recognize, diagnose, and recover from errors**: Error messages should be expressed in plain language, precisely indicate the problem, and constructively suggest a solution.
10. **Help and documentation**: Even though it is better if the system can be used without documentation, it may be necessary to provide help and documentation.

#### **Ben Shneiderman's Eight Golden Rules:**

1. **Strive for consistency**: Consistent sequences of actions should be required to perform tasks.
2. **Enable frequent users to use shortcuts**: As users' experience levels change, they should be able to use the system more efficiently.
3. **Offer informative feedback**: The system should give users feedback about what is happening.
4. **Design dialogues to yield closure**: Sequences of actions should be organized into groups with a beginning, middle, and end.
5. **Error prevention**: Even better than good error messages is a careful design that prevents a problem from occurring.
6. **Permit easy reversal of actions**: This feature alleviates anxiety since users know that errors can be undone.
7. **Keep users informed about what is going on**: Users want to be informed about what is happening through adequate and continuous feedback within a reasonable time.
8. **Internal locus of control**: Users should feel that they are in control of the system, not that the system is controlling them.

#### **Don Norman's Principles of User-Centered Design:**

1. **Visibility of system status**: The system should always keep users informed about what's happening through adequate and continuous feedback within a reasonable time.
2. **Match between system and the real world**: The system should speak the user's language, with words, phrases, and concepts familiar to the user.
3. **User control and freedom**: Users often choose system functions by mistake and will need a clearly marked "emergency exit" to leave the unwanted state.
4. **Consistency and standards**: Users should not have to wonder whether different words, situations, or actions mean the same thing.
5. **Error prevention**: Even better than good error messages is a careful design that prevents a problem from occurring in the first place.
