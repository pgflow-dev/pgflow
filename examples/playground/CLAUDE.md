# CLAUDE.md

> [!WARNING]
> QUOTE ALL THE FILE PATHS THAT CONTAIN ROUTE PARAMETERS LIKE '[run_id]'
> BECAUSE BRACKETS HAVE SPECIAL MEANING IN BASH!
> Do this: `cat 'some/path/to/[id]/page.tsx'` instead of `cat some/path/to/[id]/page.tsx`

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build/Run Commands

- `npm run dev` - Start development server
- `npm run build` - Build the application
- `npm run start` - Start production server
- `npm run start-functions` - Start Supabase Edge Functions
- `npm run start-worker` - Trigger the analyze_website function
- `npm run gen-types` - Generate TypeScript types from Supabase schema

## Utility Scripts

### run_sql.sh
A utility script for running SQL queries against the local Supabase database. It automatically gets the database URL from `supabase status`.

Location: `./scripts/run_sql.sh`

Usage:
```bash
# Run a simple query
./scripts/run_sql.sh "SELECT * FROM pgflow.flows;"

# Run with explicit -c flag
./scripts/run_sql.sh -c "SELECT COUNT(*) FROM pgflow.step_tasks;"

# Run a SQL file
./scripts/run_sql.sh -f some_script.sql

# Pipe SQL to the script
echo "SELECT NOW();" | ./scripts/run_sql.sh
```

Benefits:
- No need to remember or type the database connection string
- Automatically detects if Supabase is running
- Supports all standard psql options
- Simplifies database queries during development

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
