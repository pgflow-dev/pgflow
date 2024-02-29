<script lang="ts">
	import { page } from '$app/stores';
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

	function signOut() {
		supabase.auth.signOut();
		user = null;
	}

	const links = [
		['Edulaw QA', '/edulaw-qa'],
		['Skeleton Chat Layout', '/spikes/chat-layout'],
		['Langchain chat with memory', '/spikes/chat-with-simple-memory']
	];

	let activePath: string;
	$: activePath = $page.url.pathname;
</script>

<AppShell>
	<svelte:fragment slot="header">
		<AppBar>
			<svelte:fragment slot="lead">
				<h3 class="h3">Feedwise</h3>
			</svelte:fragment>

			<div class="flex flex-row gap-6 w-full ml-4">
				{#each links as [label, path]}
					<a href={path} class={path == activePath ? 'font-bold text-red-500' : ''}>{label}</a>
				{/each}
			</div>

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
