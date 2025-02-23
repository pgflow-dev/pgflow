# sveltekit-supabase

## Description

A simple SvelteKit app that uses Supabase for authentication via GitHub authentication.

## Features

- Sign in with GitHub
- Sign out
- Display user information
- Update user information

## Technologies

- [SvelteKit](https://kit.svelte.dev/): A framework for building web applications with Svelte
- [TypeScript](https://www.typescriptlang.org/): A typed superset of JavaScript that compiles to plain JavaScript
- [Supabase](https://supabase.io/): An open-source Firebase alternative
- [shadcn-svelte](https://shadcn-svelte.com): A Tailwind CSS component library for Svelte, based on [shadcn](https://shadcn.com)
- [Tailwind CSS](https://tailwindcss.com/): A utility-first CSS framework
- [Iconify](https://iconify.design): A unified icon framework using icons from [icones.js](https://icones.js.org/collection/all)
- [Zod](https://zod.dev): A TypeScript-first schema declaration and validation library

## Getting Started

### Running Locally

#### Prerequisites

- docker: https://docs.docker.com/desktop/insta...
- supabase cli: https://supabase.com/docs/guides/cli/...

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

### Deploying to Vercel

The easiest way to deploy this app is to use Vercel. You can deploy this app with the following steps:

### Database

1. Create a new project in the Supabase dashboard

2. Login to supabase using the console

```bash
supabase login
```

3. Link your project to the supabase cli

```bash
supabase link --project-ref <YOUR_PROJECT_ID>
```

4. Deploy your database

```bash
supabase db push
```

### Client

1. Create a new project on Vercel
2. Connect your GitHub repository
3. Add a new github OAuth app in the Github developer settings
4. Configure your environment variables, make sure you are using updated values from your newly-created Supabase project and Github OAuth app
5. Deploy

## Contributing

Contributions are welcome! Please feel free to submit a PR or open an issue.

## Thanks

Shout out to [Davis Media](https://github.com/Davis-Media) for building the base template for this project! 🤙
