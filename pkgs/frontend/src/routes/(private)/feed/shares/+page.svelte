<script lang="ts">
	import ShareRow from '../ShareRow.svelte';
	import Prompt from '$components/Prompt.svelte';
	import type { InferredFeedShareRow } from '$lib/db';
	import { writable } from 'svelte/store';
	import { fade } from 'svelte/transition';

	export let data;
	let { supabase } = data;
	$: ({ supabase } = data);

	const searchTerm = writable('');
	const shares = writable<InferredFeedShareRow[]>([]);
	const showResults = writable(false);
	const searchInProgress = writable(false);

	async function fetchRelevantShares() {
		searchInProgress.set(true);
		shares.set([]);
		const response = await supabase.schema('feed').rpc('easy_match_shares', {
			query: $searchTerm,
			match_threshold: 0.19
		});

		if (response.error) {
			throw response.error;
		}

		const data = response?.data || [];

		shares.set(data);
		showResults.set(true);
		searchInProgress.set(false);
	}
</script>

<div class="col-span-6 col-start-4 flex mb-4 pt-10 pb-4">
	<Prompt
		bind:value={$searchTerm}
		label="search"
		loading={$searchInProgress}
		placeholder="search for shares"
		on:submit={fetchRelevantShares}
	/>
</div>

<div class="col-span-10 col-start-2" in:fade={{ duration: 100, delay: 0 }}>
	{#each $shares as share (share)}
		<ShareRow {share} />
	{/each}
</div>
