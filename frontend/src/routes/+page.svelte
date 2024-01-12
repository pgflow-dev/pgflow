<script lang="ts">
	import SubmittableInput from './SubmittableInput.svelte';

	export let data;
	let { supabase } = data;
	$: ({ supabase } = data);

	let currentMessage = '';
	let inProgress = false;
	let sentiments: { text: string; sentiment: string }[] = [];

	async function checkSentiment() {
		inProgress = true;

		const { data } = await supabase.functions.invoke('sentiment', {
			body: { input: currentMessage }
		});

		inProgress = false;
		sentiments = [...sentiments, { text: currentMessage, sentiment: data[0].label }];
		currentMessage = '';
	}
</script>

<div class="flex h-screen">
	<div class="w-1/3 flex items-center justify-center"></div>

	<div class="w-1/3 flex items-center justify-center">
		<SubmittableInput
			bind:value={currentMessage}
			bind:inProgress
			on:click={checkSentiment}
			placeholder="Enter a message to check sentiment"
		/>
	</div>

	<div class="w-1/3 flex items-center justify-center">
		<div class="table-container">
			{#if sentiments.length}
				<table class="table w-3/4 mx-auto">
					<thead>
						<th>Message</th>
						<th>Sentiment</th>
					</thead>

					<tbody>
						{#each sentiments as { text, sentiment }}
							<tr>
								<td>{text}</td>
								<td>
									{#if sentiment === 'POSITIVE'}
										<span class="badge variant-filled-success">POSITIVE</span>
									{:else if sentiment === 'NEGATIVE'}
										<span class="badge variant-filled-error">NEGATIVE</span>
									{:else}
										<span class="badge variant-filled-secondary">NEUTRAL</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	</div>
</div>
