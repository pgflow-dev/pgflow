/// <reference types="@sveltejs/kit" />

declare global {
	namespace App {
		interface Locals {
			supabase: import('@supabase/supabase-js').SupabaseClient;
			getSession(): Promise<import('@supabase/supabase-js').Session | null>;
		}
		interface PageData {
			session: import('@supabase/supabase-js').Session | null;
		}
		interface Platform {
			env: {
				PUBLIC_SUPABASE_URL: string;
				PUBLIC_SUPABASE_ANON_KEY: string;
				DATABASE_URL: string;
			};
			context: {
				waitUntil(promise: Promise<any>): void;
			};
			caches: CacheStorage & { default: Cache };
		}
	}
}

export {};
