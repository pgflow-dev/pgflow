<script lang="ts">
	import { writable } from 'svelte/store';
	import Prompt from '$lib/components/Prompt.svelte';
	import useRetriever from '$lib/useRetriever';
	// import Debug from '$components/Debug.svelte';

	export let data;
	let { session, supabase } = data;
	$: ({ session, supabase } = data);

	const input = writable('');
	const loading = writable(false);

	const {
		chain: retrievalChain,
		documents,
		loading: retrieverLoading
	} = useRetriever({
		session,
		supabase,
		options: {
			match_threshold: 0.5,
			match_count: 5
		}
	});

	async function handleSubmit() {
		const currentInput = $input;
		$input = '';
		$loading = true;

		const results = await retrievalChain.invoke({ input: currentInput });
		console.log({ results });
	}

	$: console.log($documents);
</script>

<Prompt
	bind:value={$input}
	on:submit={handleSubmit}
	label="Send"
	placeholder="Search for documents"
	loading={$retrieverLoading}
/>

<div class="h-full w-full md:w-3/4 mx-auto flex flex-col tems-center p-8 card overflow-y-auto">
	{#each $documents as doc (doc)}
		<div class="card p-2 m-2 rounded-xl">
			<h4 class="h4 mb-4 font-bold">"{doc.embedded_content}"</h4>
			<strong>{doc.similarity.toFixed(2)}</strong>
			{doc.content}
			<!-- <div class="text-gray-500"> -->
			<!-- 	<span class="badge">{doc.metadata['kind']}</span> -->
			<!-- 	<span class="badge">Rozdział {doc.metadata['chapter_no']}</span> -->
			<!-- 	<span class="badge">Art. {doc.metadata['article_no']}.</span> -->
			<!---->
			<!-- 	{#if doc.metadata['paragraph_no']} -->
			<!-- 		<span class="badge">${doc.metadata['paragraph_no']}</span> -->
			<!-- 	{/if} -->
			<!---->
			<!-- 	{#if doc.metadata['point_no']} -->
			<!-- 		<span class="badge">{doc.metadata['point_no']})</span> -->
			<!-- 	{/if} -->
			<!---->
			<!-- 	{#if doc.metadata['subpoint_no']} -->
			<!-- 		<span class="badge">{doc.metadata['subpoint_no']})</span> -->
			<!-- 	{/if} -->
			<!-- </div> -->
		</div>
	{/each}
</div>
