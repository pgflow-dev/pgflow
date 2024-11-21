<script lang="ts">
	import ChatLayout from '$components/feed/ChatLayout.svelte';
	import type { Flow } from '$lib/db/pgflow.js';

	export let data;
	let { supabase } = data;
	$: ({ supabase } = data);

	let error: string | null = null;
	let flows: Flow[] = [];

	async function fetchFlows() {
		const results = await supabase
			.schema('pgflow')
			.from('flows')
			.select('flow_slug')
			.returns<Flow[]>();

		if (results.error) {
			error = results.error.message;
		} else {
			flows = results.data;
		}
	}
	fetchFlows();
</script>

<ChatLayout>
	<div slot="footer">
		<div class="p-1 flex justify-center items-center h-full space-x-2">
			{#if error}
				<div class="text-red-500">
					<p>Error: {error}</p>
				</div>
			{/if}

			{#each flows as flow (flow.flow_slug)}
				<a href="/pgflow/{flow.flow_slug}/new" class="text-md p-4 bg-black rounded-full"
					>{flow.flow_slug}</a
				>
			{/each}
		</div>
	</div>
	<slot />
</ChatLayout>
