<script lang="ts">
	export let tags: string[];
	export let className: string = '';
</script>

{#if tags.length}
	<div class="flex flex-wrap {className}">
		{#each tags as tag (tag)}
			<span class="rounded-md px-1 py-0 m-0.5 dark:bg-white dark:text-gray-600">{tag}</span>
		{/each}
	</div>
{/if}
