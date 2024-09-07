<script lang="ts">
	import { page } from '$app/stores';
	import '../app.postcss';
	import AuthIndicator from '$lib/components/AuthIndicator.svelte';
	import type { User } from '@supabase/supabase-js';
	import NewConversationButton from '$components/NewConversationButton.svelte';

	console.log('==== +layout.svelte');

	const links = [
		['Semantic', '/documents'],
		['Full Text', '/documents/search'],
		['Chats', '/conversations']
	];

	export let data;

	let user: User | null;
	let isSuperadmin: boolean = false;

	if (data.session?.user && data.isSuperadmin) {
		({ isSuperadmin } = data);
	}

	$: {
		if (data.session?.user && data.isSuperadmin) {
			({ isSuperadmin } = data);
		}
	}

	let activePath: string;
	$: activePath = $page.url.pathname;
</script>

<div class="flex flex-col h-full">
	<header class="min-h-14 max-h-14 px-4 flex flex-row items-center bg-surface-600">
		<div class="align-middle">
			<a class="h3" href="/">Feedwise</a>
		</div>

		<div class="align-middle flex-grow">
			{#if isSuperadmin}
				<div class="flex flex-row gap-6 w-full ml-4 items-center">
					{#each links as [label, path]}
						<a href={path} class={path == activePath ? 'font-bold text-red-500' : ''}>{label}</a>
					{/each}
					<NewConversationButton />
				</div>
			{/if}
		</div>

		<AuthIndicator {user} {isSuperadmin} />
	</header>

	<slot />
</div>
