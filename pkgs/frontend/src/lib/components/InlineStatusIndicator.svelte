<script lang="ts">
	import { ProgressRadial } from '@skeletonlabs/skeleton';

	export let label = 'Understanding question...';
	export let loading = true;
</script>

<div class="flex">
	<div class="w-5">
		{#if loading}
			<ProgressRadial width="w-5" stroke={100} />
		{:else}
			✅
		{/if}
	</div>
	<span class="pl-2 font-bold">{label}</span>
</div>
