<script lang="ts">
	import type { Todo } from '$lib/db/feed';

	export let todo: Todo;
</script>

<label
	class="overflow-x-auto card break-inside-avoid p-2 variant-soft-secondary relative border border-gray-600 flex items-center space-x-2"
>
	<input type="checkbox" class="h-4 w-4" />
	<span>{todo.title}</span>
</label>
