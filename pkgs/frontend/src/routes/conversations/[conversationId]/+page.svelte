<script lang="ts">
	import Page from './Page.svelte';
	import { page } from '$app/stores';

	export let data;
</script>

{#key $page.url.pathname}
	<Page {data} />
{/key}
