<script lang="ts">
	import { page } from '$app/stores';
	import '../app.postcss';
	import { AppShell, AppBar } from '@skeletonlabs/skeleton';
	import AuthIndicator from '$lib/components/AuthIndicator.svelte';
	import type { User } from '@supabase/supabase-js';

	const links = [
		['Edulaw', '/spikes/edulaw-qa'],
		['layout', '/spikes/chat-layout'],
		['simple', '/spikes/chat-with-simple-memory'],
		['vector', '/spikes/chat-with-vector-memory'],
		['chat-runner', '/spikes/runnable-ui'],
		['supabase-memory', '/spikes/supabase-memory']
	];

	export let data;

	let user: User | null;
	let isSuperadmin: boolean = false;

	if (data.session?.user && data.isSuperadmin) {
		({
			session: { user },
			isSuperadmin
		} = data);
	}

	$: {
		if (data.session?.user && data.isSuperadmin) {
			({
				session: { user },
				isSuperadmin
			} = data);
		}
	}

	let activePath: string;
	$: activePath = $page.url.pathname;
</script>

<AppShell>
	<svelte:fragment slot="header">
		<AppBar>
			<svelte:fragment slot="lead">
				<a class="h3" href="/">Feedwise</a>
			</svelte:fragment>

			{#if isSuperadmin}
				<div class="flex flex-row gap-6 w-full ml-4">
					{#each links as [label, path]}
						<a href={path} class={path == activePath ? 'font-bold text-red-500' : ''}>{label}</a>
					{/each}
				</div>
			{/if}

			<svelte:fragment slot="trail">
				<AuthIndicator {user} {isSuperadmin} />
			</svelte:fragment>
		</AppBar>
	</svelte:fragment>
	<slot />
	<svelte:fragment slot="pageFooter"></svelte:fragment>
</AppShell>
