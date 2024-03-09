<script lang="ts">
	import { goto } from '$app/navigation';
	import type { User } from '@supabase/supabase-js';
	import { supabase } from '$lib/supabaseClient';
	import type { Session } from '@supabase/supabase-js';

	export let session: Session;
	export let isSuperadmin: boolean;

	let user: User | null;
	if (session?.user) {
		({ user } = session);
	}
	$: {
		if (session?.user) {
			({ user } = session);
		}
	}

	function signOut() {
		supabase.auth.signOut();
		user = null;
		goto('/');
	}
</script>

{#if user}
	<span class="font-bold">
		{user.email}

		{#if isSuperadmin}
			<span title="Superadmin" class="badge">👑</span>
		{/if}
	</span>

	<button class="btn btn-sm variant-ghost-tertiary" on:click={signOut}>Sign out</button>
{:else}
	<a class="btn btn-sm variant-filled" href="/auth/sign-in">Sign in</a>
{/if}
