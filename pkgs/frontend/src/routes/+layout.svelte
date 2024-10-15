<script lang="ts">
	import '../app.postcss';

	import { Icon } from 'svelte-awesome';
	import { signOut, bars, comments, fileText, rss, signIn, share } from 'svelte-awesome/icons';

	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';

	// @ts-expect-error svelte-check complains about this virtual module
	import { pwaInfo } from 'virtual:pwa-info';
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

	import * as Drawer from '$components/ui/drawer';
	import { writable } from 'svelte/store';
	const isDrawerOpen = writable(false);

	import { Button } from '$components/ui/button';

	import { ModeWatcher } from 'mode-watcher';
</script>

<ModeWatcher />

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html webManifest}

	<title>feedwise</title>
</svelte:head>

<header class="sticky top-0 w-full">
	<div class="flex justify-between items-center p-2">
		<h1 class="pl-4 font-bold"><a href="/">feedwise</a></h1>
		<Button variant="ghost" on:click={() => isDrawerOpen.set(true)}>
			<Icon data={bars} />
		</Button>
	</div>

	<div class="divider" />
</header>

<div class="flex flex-col h-[calc(100vh-64px)] overflow-y-auto pt-2">
	<slot />
</div>

<Drawer.Root open={$isDrawerOpen} onClose={() => isDrawerOpen.set(false)}>
	<Drawer.Content>
		<div class="p-4 space-y-6">
			<div class="space-y-2">
				<a class="btn btn-sm variant-soft-primary w-full" href="/share">
					<Icon data={share} scale={0.8} />
					<span class="ml-2">Share</span>
				</a>

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
				<a class="btn btn-sm variant-soft-primary w-full" href="/feed/add-share">
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
					{:else}
						<a href="/auth/sign-in" class="btn btn-sm variant-soft-primary w-full">
							<Icon data={signIn} />
							<span class="ml-2">Sign In</span>
						</a>
					{/if}
				</div>
			</div>
		</div>
		<!-- <Drawer.Header> -->
		<!-- 	<Drawer.Title>feedwise</Drawer.Title> -->
		<!-- 	<!-- <Drawer.Description>This action cannot be undone.</Drawer.Description> --> -->
		<!-- </Drawer.Header> -->
		<!-- <Drawer.Footer> -->
		<!-- 	<button>Submit</button> -->
		<!-- 	<Drawer.Close>Cancel</Drawer.Close> -->
		<!-- </Drawer.Footer> -->
	</Drawer.Content>
</Drawer.Root>
