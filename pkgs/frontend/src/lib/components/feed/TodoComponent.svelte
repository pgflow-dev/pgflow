<script lang="ts">
	import type { Todo } from '$lib/db/feed';

	export let todo: Todo;
</script>

<div
	class="overflow-x-auto card break-inside-avoid p-2 variant-soft-secondary relative border border-gray-800"
>
	<!-- huge checkbox -->
	<label>
		<input type="checkbox" />
		<span>{todo.title}</span>
	</label>
</div>
