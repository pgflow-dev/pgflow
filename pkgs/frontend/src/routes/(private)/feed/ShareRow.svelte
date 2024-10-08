<script lang="ts">
	import type { InferredFeedShareRow } from '$lib/db';
	export let share: InferredFeedShareRow;
	import UiComponent from '$lib/components/ui/Component.svelte';
</script>

<UiComponent share={share.inferred} />
