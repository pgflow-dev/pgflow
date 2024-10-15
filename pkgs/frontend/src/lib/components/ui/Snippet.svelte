<script lang="ts">
	export let source: string;
	export let language_code: string;
</script>

<div
	class="overflow-x-auto card break-inside-avoid p-2 variant-soft-secondary relative border border-gray-800"
>
	<span class="chip absolute top-1 right-1 text-xs p-0.5 text-gray-400">{language_code}</span>
	<pre><code class="text-sm">{source}</code></pre>
</div>
