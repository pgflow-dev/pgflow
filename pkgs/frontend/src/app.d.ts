// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
// and what to do when importing types
declare namespace App {
	interface Locals {
		supabase: SupabaseClient;
		getSession(): Promise<Session | null>;
		checkIsSuperadmin(): Promise<boolean>;
	}
	// interface PageData {}
	// interface Error {}
	// interface Platform {}
}
