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
	}

	interface ImportMetaEnv {
		VITE_PUBLIC_SUPABASE_URL: string;
		VITE_PUBLIC_SUPABASE_ANON_KEY: string;
		VITE_DATABASE_URL: string;
	}
}

export {};
