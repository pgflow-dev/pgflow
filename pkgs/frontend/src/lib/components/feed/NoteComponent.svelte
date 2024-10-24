<script lang="ts">
	import Tags from '$components/Tags.svelte';
	import type { Note } from '$lib/db/feed';

	export let note: Note;
</script>

<div
	class="overflow-x-auto card break-inside-avoid p-2 variant-soft-secondary relative border border-gray-600"
>
	<span>{note.text}</span>
	<Tags tags={note.tags || []} />
</div>
