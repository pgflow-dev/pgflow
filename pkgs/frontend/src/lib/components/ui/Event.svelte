<script lang="ts">
	export let title: string;
	export let datetime: string;
	export let place: string;
	export let description: string;

	const formattedDatetime = new Date(datetime).toLocaleString('en-US', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: 'numeric',
		minute: 'numeric'
	});
</script>

<div class="card break-inside-avoid p-4 variant-soft-primary relative">
	<h2 class="text-2xl font-semibold mb-2">{title}</h2>
	<p class="text-xl text-right">{formattedDatetime}</p>
	<p class="text-sm text-right">{place}</p>
	<hr />
	<p class="text-sm">{description}</p>
</div>
