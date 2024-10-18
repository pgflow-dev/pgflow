<script lang="ts">
	import '../app.postcss';

	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';

	// @ts-expect-error svelte-check complains about this virtual module
	import { pwaInfo } from 'virtual:pwa-info';
	$: webManifest = pwaInfo ? pwaInfo.webManifest.linkTag : '';

	export let data;
	$: ({ session, supabase } = data);

	onMount(() => {
		const { data } = supabase.auth.onAuthStateChange((_, newSession) => {
			if (newSession?.expires_at !== session?.expires_at) {
				invalidate('supabase:auth');
			}
		});

		return () => data.subscription.unsubscribe();
	});

	import { ModeWatcher } from 'mode-watcher';
</script>

<ModeWatcher />

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html webManifest}

	<title>feedwise</title>
</svelte:head>

<slot />
