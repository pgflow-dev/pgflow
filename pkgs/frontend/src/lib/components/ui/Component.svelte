<script lang="ts">
	import type { InferredFeedShareRow } from '$lib/db/feed';
	import Text from './Text.svelte';
	import Snippet from './Snippet.svelte';

	export let share: InferredFeedShareRow;
</script>

{#if share?.inferred_type}
	<Snippet source={share.content} language_code={share.inferred_type} />
{:else}
	<Text text={share.content} loading={true} />
{/if}
