<script lang="ts">
	import type { Event } from '$lib/db/feed';

	export let event: Event;

	const formattedDatetime = new Date(event.time).toLocaleString('en-US', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: 'numeric',
		minute: 'numeric'
	});
</script>

<div class="card break-inside-avoid p-4 variant-soft-primary relative border-gray-600">
	<h2 class="text-2xl font-semibold mb-2">{event.title}</h2>
	<p class="text-xl text-right">{formattedDatetime}</p>
	<p class="text-sm text-right">{event.place}</p>
	<hr />
	<p class="text-sm">{event.description}</p>
</div>
