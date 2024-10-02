<script lang="ts">
	import '../app.postcss';
	import type { User } from '@supabase/supabase-js';

	// @ts-expect-error svelte-check complains about this virtual module
	import { pwaInfo } from 'virtual:pwa-info';
	import { AppBar } from '@skeletonlabs/skeleton';

	$: webManifest = pwaInfo ? pwaInfo.webManifest.linkTag : '';

	export let data;

	let user: User | null;
	let isSuperadmin: boolean = false;

	if (data.session?.user && data.isSuperadmin) {
		({
			isSuperadmin,
			session: { user }
		} = data);
	}

	$: {
		if (data.session?.user && data.isSuperadmin) {
			({
				isSuperadmin,
				session: { user }
			} = data);
		}
	}
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html webManifest}
</svelte:head>

<AppBar gridColumns="grid-cols-3" slotDefault="place-self-center" slotTrail="place-content-end">
	<svelte:fragment slot="lead">
		<button class="btn btn-sm variant-ghost">menu</button>
	</svelte:fragment>
	FeedWise
	<svelte:fragment slot="trail">
		{#if user}
			<a href="/auth/sign-out" class="btn btn-sm variant-ghost">
				{#if isSuperadmin}👑{:else}👤{/if}
			</a>
		{:else}
			<a href="/auth/sign-in" class="btn btn-sm variant-filled-primary">sign in</a>
		{/if}
	</svelte:fragment>
</AppBar>

<div class="flex flex-col h-full">
	<slot />
</div>
