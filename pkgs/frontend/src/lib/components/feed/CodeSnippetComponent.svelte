<script lang="ts">
	import type { CodeSnippet } from '$lib/db/feed';

	export let code_snippet: CodeSnippet;
</script>

<div
	class="overflow-x-auto card break-inside-avoid p-2 variant-soft-secondary relative border border-gray-800"
>
	<span class="chip absolute top-1 right-1 text-xs p-0.5 text-gray-400"
		>{code_snippet.language_code}</span
	>
	<pre><code class="text-sm">{code_snippet.source}</code></pre>
</div>
