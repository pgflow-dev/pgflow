<script lang="ts">
	import { Loader } from 'lucide-svelte';
	import { cn } from '$lib/utils.js';

	export let className = '';
</script>

<Loader class={cn('animate-spin', className)} />
