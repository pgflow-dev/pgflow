# sveltekit-supabase

## Description

A simple SvelteKit app that uses Supabase for authentication via GitHub authentication.

## Features

- Sign in with GitHub
- Sign out
- Display user information
- Update user information

## Technologies

- [SvelteKit](https://kit.svelte.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Supabase](https://supabase.io/)
- [shadcn-svelte](https://shadcn-svelte.com)
- [Tailwind CSS](https://tailwindcss.com/)
- [Zod](https://zod.dev)

## Getting Started

1. Clone the repo

```bash
git clone https://github.com/engageintellect/sveltekit-supabase
cd sveltekit-supabase
```

2. Install dependencies

```bash
pnpm i
```

3. Create a `.env.local` based on `.env.example` and fill in your own credentials

```bash
cp .env.example .env.local
```

4. Start your supabase server with

```bash
supabase start
```

**Note:** You need to have the [Supabase CLI](https://supabase.io/docs/guides/cli) installed to run the above command.

5. Supabase console will be available at `http://localhost:54323`

6. Start your app

```bash
pnpm run dev
```

7. Navigate to [localhost:5173](http://localhost:3000) to see your app running.

## Contributing

Contributions are welcome! Please feel free to submit a PR or open an issue.
