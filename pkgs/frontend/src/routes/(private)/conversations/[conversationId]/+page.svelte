<script lang="ts">
	import Page from './Page.svelte';
	import { page } from '$app/stores';

	export let data;

	console.log('==== /conversations/stream-[conversationId]/+page.svelte');
</script>

{#key $page.url.pathname}
	<Page {data} />
{/key}
