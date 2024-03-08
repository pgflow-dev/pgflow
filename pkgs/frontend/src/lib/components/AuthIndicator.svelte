<script lang="ts">
	let user: User | null;
	import { goto } from '$app/navigation';
	import type { SupabaseClient, Session, User } from '@supabase/supabase-js';

	export let supabase: SupabaseClient;
	export let session: Session | null;

	$: {
		if (session) {
			user = session.user;
		}
	}

	function signOut() {
		supabase.auth.signOut();
		user = null;
		goto('/');
	}
</script>

{#if user}
	<span class="font-bold">{user.email}</span>

	<button class="btn btn-sm variant-soft-warning" on:click={signOut}>Sign out</button>
{:else}
	<a class="btn btn-sm variant-filled" href="/auth/sign-in">Sign in</a>
{/if}
