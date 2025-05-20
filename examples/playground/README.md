# pgflow Playground

A demo application showcasing pgflow workflows with Next.js and Supabase integration.

## Features

- Website analysis workflow with pgflow
- Next.js frontend with App Router
- Supabase backend with pgflow integration
- Edge Worker execution of workflow tasks

## Architecture

This playground demonstrates the complete pgflow stack:

1. **Frontend**: Next.js application for triggering and displaying workflow results
2. **Backend**: Supabase with pgflow core database schema
3. **Workers**: Edge Workers processing workflow tasks
4. **Workflow Definition**: Example website analysis flow

## Development

### Prerequisites

- Node.js 18+
- npm or pnpm
- Supabase CLI

### Local Development with Nx

This playground is integrated with the Nx monorepo structure. You can use Nx commands for development:

```bash
# Start Next.js development server
nx run playground:dev

# Build the application
nx run playground:build

# Start production server
nx run playground:start

# Supabase commands
nx run playground:supabase:start
nx run playground:supabase:stop
nx run playground:supabase:functions
nx run playground:supabase:workers
nx run playground:supabase:gen-types
```

### Using npm scripts

For compatibility, you can also use the original npm scripts:

```bash
# Start development server
npm run dev

# Build the application
npm run build

# Start production server
npm run start

# Start Supabase
npm run start-supabase

# Stop Supabase
npm run stop-supabase

# Start Edge Functions
npm run start-functions

# Start Workers
npm run start-workers

# Generate types
npm run gen-types
```

## Workflow Definition

The example workflow is defined in `supabase/functions/_flows/analyze_website.ts` using the pgflow DSL. It performs the following steps:

1. Scrape a website URL
2. Save website metadata
3. Convert HTML to markdown
4. Extract tags from content
5. Generate an AI summary

## How It Works

1. User submits a URL in the frontend
2. The analyze_website flow is triggered through Supabase
3. Edge Workers process each step of the workflow
4. Results are stored in the database and displayed to the user

## Supabase Functions

The application uses the following Supabase Edge Functions:

- `analyze_website_worker_0`: Worker for processing tasks
- `analyze_website_worker_1`: Secondary worker for parallel processing
- `_tasks/*`: Individual task implementations

## Configuration

Set up your local environment:

1. Run `nx run playground:supabase:gen-types` to generate database types
2. Make sure Supabase is running with `nx run playground:supabase:start`
3. Start the Edge Functions with `nx run playground:supabase:functions`
4. Start the workers with `nx run playground:supabase:workers`
5. Start the Next.js app with `nx run playground:dev`

## Note on Dependencies

This playground uses published versions of pgflow packages:

- `npm:@pgflow/dsl` for workflow definition
- `jsr:@pgflow/edge-worker` for worker implementation

This is required because Supabase Edge Functions cannot access workspace dependencies.