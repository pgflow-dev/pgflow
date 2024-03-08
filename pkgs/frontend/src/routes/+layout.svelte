<script lang="ts">
	import { page } from '$app/stores';
	import '../app.postcss';
	import { AppShell, AppBar } from '@skeletonlabs/skeleton';
	import AuthIndicator from '$lib/components/AuthIndicator.svelte';

	export let data;
	let { supabase, session } = data;
	$: ({ supabase, session } = data);

	const links = [
		['Edulaw QA', '/edulaw-qa'],
		['Chat Layout', '/spikes/chat-layout'],
		['Chat (simple memory)', '/spikes/chat-with-simple-memory'],
		['Chat (vector memory)', '/spikes/chat-with-vector-memory']
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
				<AuthIndicator {supabase} {session} />
			</svelte:fragment>
		</AppBar>
	</svelte:fragment>
	<slot />
	<svelte:fragment slot="pageFooter"></svelte:fragment>
</AppShell>
