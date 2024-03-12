<script lang="ts">
	import { MODEL_IDS } from '$lib/remoteRunnables';
	import { currentModelId } from '$lib/currentModelIdStore';
</script>

<select bind:value={$currentModelId} class="select select-bordered w-56">
	{#each MODEL_IDS as modelId}
		<option value={modelId}>{modelId}</option>
	{/each}
</select>
