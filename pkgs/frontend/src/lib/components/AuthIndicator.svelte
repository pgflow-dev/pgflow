<script lang="ts">
	import { goto } from '$app/navigation';
	import type { User } from '@supabase/supabase-js';
	import { supabase } from '$lib/supabaseClient';

	export let user: User;
	export let isSuperadmin: boolean;

	function signOut() {
		supabase.auth.signOut();
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
