<script lang="ts">
	export let label = 'Understanding question...';
	export let loading = true;
</script>

<div class="flex">
	<div class="w-5">
		{#if loading}
			<span class="spinning-hourglass">⌛</span>
		{:else}
			✅
		{/if}
	</div>
	<span class="pl-2 font-bold">{label}</span>
</div>

<style>
	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}
	.spinning-hourglass {
		animation: spin 2s linear infinite;
		display: inline-block;
	}
</style>
