<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { initPlausible } from '$lib/analytics';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		// Initialize Plausible Analytics
		initPlausible({
			domain: 'demo.pgflow.dev',
			apiHost: 'https://pgflow-demo-edge.jumski.workers.dev/stats',
			trackLocalhost: false // Set to true for local testing
		});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
