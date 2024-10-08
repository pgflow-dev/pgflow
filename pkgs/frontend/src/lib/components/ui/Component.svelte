<script lang="ts">
	import type { ShareMetadata } from '$lib/shareMetadataSchema';
	import Bookmark from './Bookmark.svelte';
	import Event from './Event.svelte';
	import Text from './Text.svelte';
	import Snippet from './Snippet.svelte';

	export let share: ShareMetadata;
</script>

{#if share?.ui === undefined}
	<div class="card break-inside-avoid p-2 bg-gray-200 flex items-center variant-ghost-warning">
		<p class="text-sm">Inferring...</p>
	</div>
{:else if share.ui.type === 'bookmark'}
	<Bookmark {...share.ui} />
{:else if share.ui.type === 'event'}
	<Event {...share.ui} />
{:else if share.ui.type === 'text'}
	<Text {...share.ui} />
{:else if share.ui.type === 'snippet'}
	<Snippet {...share.ui} />
{/if}
