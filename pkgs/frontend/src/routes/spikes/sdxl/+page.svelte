<script lang="ts">
	import Prompt from '$components/Prompt.svelte';

	let storyPrompt = '';
	let inProgress = false;
	let prompts: Array<string> = [];

	function onSubmit() {
		prompts = [...prompts, storyPrompt];
		storyPrompt = '';
	}
</script>

<div class="flex flex-col container justify-center items-center h-full">
	<div class="m-8 container">
		<Prompt
			bind:value={storyPrompt}
			placeholder="Write a story in one sentence here"
			label="generate"
			bind:inProgress
			on:submit={onSubmit}
		/>
	</div>
	<div>
		<h3>Prompts</h3>
		{#each prompts as prompt}
			<pre>{prompt}</pre>
		{/each}
	</div>
	<div></div>
</div>
