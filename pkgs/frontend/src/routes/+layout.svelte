<script lang="ts">
	import { page } from '$app/stores';
	import '../app.postcss';
	import { AppShell, AppBar } from '@skeletonlabs/skeleton';
	import AuthIndicator from '$lib/components/AuthIndicator.svelte';

	const links = [
		['Edulaw QA', '/spikes/edulaw-qa'],
		['Chat (layout)', '/spikes/chat-layout'],
		['Chat (simple)', '/spikes/chat-with-simple-memory'],
		['Chat (vector)', '/spikes/chat-with-vector-memory'],
		['createChatRunner', '/spikes/runnable-ui']
	];

	export let data;
	let { isSuperadmin } = data;
	$: ({ isSuperadmin } = data);

	let activePath: string;
	$: activePath = $page.url.pathname;
</script>

<AppShell>
	<svelte:fragment slot="header">
		<AppBar>
			<svelte:fragment slot="lead">
				<a class="h3" href="/">Feedwise</a>
			</svelte:fragment>

			<div class="flex flex-row gap-6 w-full ml-4">
				{#each links as [label, path]}
					<a href={path} class={path == activePath ? 'font-bold text-red-500' : ''}>{label}</a>
				{/each}
			</div>

			<svelte:fragment slot="trail">
				<AuthIndicator {isSuperadmin} />
			</svelte:fragment>
		</AppBar>
	</svelte:fragment>
	<slot />
	<svelte:fragment slot="pageFooter"></svelte:fragment>
</AppShell>
