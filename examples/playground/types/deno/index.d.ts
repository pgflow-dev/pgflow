// Minimal Deno runtime stub – enough for @supabase/supabase-js to type-check
declare namespace Deno {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-empty-object-type
  interface Reader {}
  interface Env {
    get(key: string): string | undefined;
  }
  const env: Env;
}

export {}; // makes this a module and avoids global pollution
