<script lang="ts">
	import type { Entity, InferredFeedShareRow } from '$lib/db/feed';
	import Text from './Text.svelte';
	import Snippet from './Snippet.svelte';

	export let share: InferredFeedShareRow;
	export let entities: Entity[];
</script>

{#if share?.inferred_type}
	<Snippet source={share.content} language_code={share.inferred_type} />
{:else}
	<div>
		<Text text={share.content} loading={true} />
		{#if entities}
			<pre class="text-sm">{JSON.stringify(entities, null, 4)}</pre>
		{/if}
	</div>
{/if}
