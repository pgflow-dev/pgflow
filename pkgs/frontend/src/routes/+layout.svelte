<script lang="ts">
	import '../app.postcss';

	import { Icon } from 'svelte-awesome';
	import { signOut, bars, comments, fileText, rss } from 'svelte-awesome/icons';

	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';

	// @ts-expect-error svelte-check complains about this virtual module
	import { pwaInfo } from 'virtual:pwa-info';
	import { AppBar } from '@skeletonlabs/skeleton';

	$: webManifest = pwaInfo ? pwaInfo.webManifest.linkTag : '';

	export let data;
	$: ({ session, supabase, user } = data);

	onMount(() => {
		const { data } = supabase.auth.onAuthStateChange((_, newSession) => {
			if (newSession?.expires_at !== session?.expires_at) {
				invalidate('supabase:auth');
			}
		});

		return () => data.subscription.unsubscribe();
	});

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

	<title>feedwise</title>
</svelte:head>

<AppBar gridColumns="grid-cols-3" slotDefault="place-self-center" slotTrail="place-content-end">
	<svelte:fragment slot="lead">
		<button class="text-gray-300 p-1" on:click={openDrawer}>
			<Icon data={bars} />
		</button>
	</svelte:fragment>
	<h3 class="h3 font-bold text-secondary-300">feedwise</h3>
	<svelte:fragment slot="trail"></svelte:fragment>
</AppBar>

<div class="flex flex-col h-full">
	<slot />
</div>

<Drawer>
	<div class="p-4 space-y-6">
		<div class="space-y-2">
			<h3 class="h3 font-bold text-primary-500">Edulaw Chatbot</h3>
			<a class="btn btn-sm variant-soft-primary w-full" href="/conversations">
				<Icon data={comments} scale={0.8} />
				<span class="ml-2">Conversations</span>
			</a>
			<a class="btn btn-sm variant-soft-primary w-full" href="/conversations/new">
				<Icon data={comments} scale={0.8} />
				<span class="ml-2">New Conversation</span>
			</a>
		</div>

		<div class="space-y-2">
			<h3 class="h3 font-bold text-primary-500">Edulaw Docs</h3>
			<a class="btn btn-sm variant-soft-primary w-full" href="/documents">
				<Icon data={fileText} scale={0.8} />
				<span class="ml-2">Semantic search</span>
			</a>
			<a class="btn btn-sm variant-soft-primary w-full" href="/documents/search">
				<Icon data={fileText} scale={0.8} />
				<span class="ml-2">Full text search</span>
			</a>
		</div>

		<div class="space-y-2">
			<h3 class="h3 font-bold text-primary-500">Feed</h3>
			<a class="btn btn-sm variant-soft-primary w-full" href="/feed">
				<Icon data={rss} scale={0.8} />
				<span class="ml-2">Recent saves</span>
			</a>
			<a class="btn btn-sm variant-soft-primary w-full" href="/feed/add-note">
				<Icon data={rss} scale={0.8} />
				<span class="ml-2">New save</span>
			</a>

			<div class="space-y-2">
				<h3 class="h3 font-bold text-primary-500">Account</h3>
				{#if user}
					<a href="/auth/sign-out" class="btn btn-sm variant-soft-primary w-full">
						<Icon data={signOut} />
						<span class="ml-2">Sign Out</span>
					</a>
				{/if}
			</div>
		</div>
	</div></Drawer
>
