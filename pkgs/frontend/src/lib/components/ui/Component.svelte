<script lang="ts">
	import type { InferredFeedShareRow } from '$lib/db';
	import type {
		InferredBookmark,
		InferredEvent,
		InferredText,
		InferredSnippet
	} from '$lib/shareMetadataSchema';
	import Bookmark from './Bookmark.svelte';
	import Event from './Event.svelte';
	import Text from './Text.svelte';
	import Snippet from './Snippet.svelte';

	export let share: InferredFeedShareRow;

	function isBookmark(share: InferredFeedShareRow): share is InferredFeedShareRow & {
		inferred_type: 'bookmark';
		inferred: { ui: InferredBookmark };
	} {
		return share.inferred_type === 'bookmark';
	}

	function isEvent(
		share: InferredFeedShareRow
	): share is InferredFeedShareRow & { inferred_type: 'event'; inferred: { ui: InferredEvent } } {
		return share.inferred_type === 'event';
	}

	function isText(
		share: InferredFeedShareRow
	): share is InferredFeedShareRow & { inferred_type: 'text'; inferred: { ui: InferredText } } {
		return share.inferred_type === 'text';
	}

	function isSnippet(share: InferredFeedShareRow): share is InferredFeedShareRow & {
		inferred_type: 'snippet';
		inferred: { ui: InferredSnippet };
	} {
		return share.inferred_type === 'snippet';
	}
</script>

{#if share?.inferred.ui === undefined}
	<div class="card break-inside-avoid p-2 bg-gray-200 flex items-center variant-ghost-warning">
		<p class="text-sm">Inferring...</p>
		{#if share?.inferred_type}
			<div class="chip animate-bounce">
				{JSON.stringify(share.inferred_type, null, 2)}
			</div>
		{/if}
	</div>
{:else if isBookmark(share)}
	<Bookmark {...share.inferred.ui} />
{:else if isEvent(share)}
	<Event {...share.inferred.ui} />
{:else if isText(share)}
	<Text {...share.inferred.ui} />
{:else if isSnippet(share)}
	<Snippet {...share.inferred.ui} />
{/if}
