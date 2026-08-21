---
"pgflow": patch
---

Fix freshly installed projects failing to start: the generated `supabase/flows/index.ts` contained a commented-out example import that the Supabase CLI's text-based import scanner treats as a real import, aborting `supabase start` with `failed to read file: supabase/flows/my-flow.ts`.
