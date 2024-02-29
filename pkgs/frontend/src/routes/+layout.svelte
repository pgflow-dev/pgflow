<script lang="ts">
	import '../app.postcss';
	import { AppShell, AppBar } from '@skeletonlabs/skeleton';
	import type { User } from '@supabase/supabase-js';

	let user: User | null;

	export let data;
	let { supabase, session } = data;
	$: ({ supabase, session } = data);
	$: {
		if (session) {
			user = session.user;
		}
	}

	// Floating UI for Popups
	import { computePosition, autoUpdate, flip, shift, offset, arrow } from '@floating-ui/dom';
	import { storePopup } from '@skeletonlabs/skeleton';
	storePopup.set({ computePosition, autoUpdate, flip, shift, offset, arrow });

	function signOut() {
		supabase.auth.signOut();
		user = null;
	}
</script>

<AppShell>
	<svelte:fragment slot="header">
		<AppBar>
			<svelte:fragment slot="lead">
				<h3 class="h3">Feedwise</h3>
			</svelte:fragment>

			<svelte:fragment slot="trail">
				{#if user}
					<span class="font-bold">{user.email}</span>

					<button class="btn btn-sm variant-soft-warning" on:click={signOut}>Sign out</button>
				{:else}
					<a class="btn btn-sm variant-filled" href="/auth/sign-in">Sign in</a>
				{/if}
			</svelte:fragment>
		</AppBar>
	</svelte:fragment>
	<slot />
	<svelte:fragment slot="pageFooter"></svelte:fragment>
</AppShell>
