<script lang="ts">
	import Prompt from '$components/Prompt.svelte';
	import { writable } from 'svelte/store';

	export let data;
	let { supabase } = data;
	$: ({ supabase } = data);

	type Doc = { id: number; content: string };

	const input = writable('');
	const loading = writable(false);
	const documents = writable<Doc[]>([]);

	const handleSubmit = async () => {
		const searchQuery = $input;
		$input = '';

		loading.set(true);

		const docs = await supabase
			.from('documents')
			.select('*')
			.textSearch('content', `'${searchQuery}'`, { type: 'websearch' })
			.limit(5)
			.returns<Doc[]>();

		if (docs.data) {
			documents.set(docs.data);
		}

		loading.set(false);
	};
</script>

<div class="flex flex-col gap-4">
	<Prompt
		bind:value={$input}
		on:submit={handleSubmit}
		loading={$loading}
		placeholder="Search docs..."
	/>
</div>

<ul>
	{#each $documents as doc (doc)}
		<li class="pb-4">
			{doc.content}
		</li>
	{/each}
</ul>
