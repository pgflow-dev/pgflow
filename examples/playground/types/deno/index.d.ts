// Minimal Deno runtime stub – enough for @supabase/supabase-js to type-check
declare namespace Deno {
  interface Reader {
    read(p: Uint8Array): Promise<number | null>;
  }  // needed by BodyInit union type
  interface Env {
    get(key: string): string | undefined;
  }
  const env: Env;
}

export {};   // makes this a module and avoids global pollution