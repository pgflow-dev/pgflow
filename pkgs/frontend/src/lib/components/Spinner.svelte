<script lang="ts">
	import { LoaderCircle } from 'lucide-svelte';
	import { cn } from '$lib/utils.js';

	export let className = '';
</script>

<LoaderCircle class={cn('animate-spin', className)} />
