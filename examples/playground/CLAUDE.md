# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build/Run Commands
- `npm run dev` - Start development server
- `npm run build` - Build the application
- `npm run start` - Start production server
- `npm run start-functions` - Start Supabase Edge Functions 
- `npm run start-worker` - Trigger the analyze_website function
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