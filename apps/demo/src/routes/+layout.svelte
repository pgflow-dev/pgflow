<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<script
		defer
		data-domain="demo.pgflow.dev"
		data-api="https://pgflow-demo-edge.jumski.workers.dev/stats/api/event"
		src="https://plausible.io/js/script.js"
	></script>
</svelte:head>

{@render children()}
