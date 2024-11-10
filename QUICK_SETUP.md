# Quick Setup

## Tools

### Node

- Version:` 20.x`
- Package manager: [pnpm](https://pnpm.io/)

### Python

- Version: `>=3.11`
- Package manager: [PDM](https://pdm-project.org/en/latest/)

### Lefthook (githook runner)

```bash
go install github.com/evilmartians/lefthook@latest
cd path/to/project/root
lefthook install
```

## Starting dev env

- Every subproject has a `package.json` file (even python projects).
- Every subproject's dev environment can be started with `pnpm dev` command.

## Subprojects

Subprojects live in `pkgs/` directory.

### `pkgs/supabase/`

All subprojects connect to this supabase instance.

### `pkgs/frontend/`

Frotnend is implemented with [SvelteKit](https://svelte.dev/).

- Supabase for auth and persistence.
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [shadcn-svelte](https://www.shadcn-svelte.com/) for reusable UI components


### `pkgs/edulaw-ai-backend/`

Python [FastAPI](https://fastapi.tiangolo.com/) app that serves various
AI/LLM related endpoints via LangChain/LangServe.

#### `pkgs/feed-processor`

Python task queue processor that uses [PgQueuer](https://github.com/janbjorge/pgqueuer) 
and connects to Supabase for the queue.
