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

	// Drawer
	import { initializeStores, Drawer } from '@skeletonlabs/skeleton';
	import { getDrawerStore } from '@skeletonlabs/skeleton';
	import { onDestroy } from 'svelte';
	initializeStores();

	const drawerStore = getDrawerStore();
	const openDrawer = () => drawerStore.open({ position: 'right' });
	const closeDrawer = () => drawerStore.close();

	onDestroy(closeDrawer);
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html webManifest}
</svelte:head>

<AppBar gridColumns="grid-cols-3" slotDefault="place-self-center" slotTrail="place-content-end">
	<svelte:fragment slot="lead">
		<button class="btn btn-sm variant-ghost" on:click={openDrawer}>menu</button>
	</svelte:fragment>
	<h3 class="h3">feedwise</h3>
	<svelte:fragment slot="trail">
		{#if user}
			<a href="/auth/sign-out" class="btn btn-sm variant-ghost">
				{#if isSuperadmin}👑{:else}👤{/if}
			</a>
		{:else}
			<a href="/auth/sign-in-2" class="btn btn-sm variant-filled-primary">sign in</a>
		{/if}
	</svelte:fragment>
</AppBar>

<div class="flex flex-col h-full">
	<slot />
</div>

<Drawer>
	<div class="flex flex-col order-red-50 border w-full">
		<div class="flex-c">
			<h3>Edulaw Chatbot</h3>
			<a class="btn" href="/conversations">Conversations</a>
			<a class="btn" href="/conversations/new">New Conversation</a>
		</div>

		<div class="flex-c">
			<h3>Edulaw Docs</h3>
			<a class="btn" href="/documents">Semantic search</a>
			<a class="btn" href="/documents/search">Full text search</a>
		</div>

		<div class="flex-c">
			<h3>Feed</h3>
			<a class="btn" href="/feed">Recent saves</a>
			<a class="btn" href="/feed/add-note">New save</a>
		</div>
	</div>
</Drawer>
