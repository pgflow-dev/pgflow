<script lang="ts">
	export let value: any; // eslint-disable-line @typescript-eslint/no-explicit-any
	export let label: string | null = null;
</script>

<div class="border border-white">
	{#if label}
		<span class="font-bold h4">{label}</span>
	{/if}

	<pre class="whitespace-pre p-4 overflow-x-auto">
		{JSON.stringify(value, null, 2).trimStart()}
	</pre>
</div>
