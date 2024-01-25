<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	let currentDate = new Date();
	let interval: ReturnType<typeof setInterval>;

	const formatter = new Intl.DateTimeFormat('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		fractionalSecondDigits: 3
	});

	// format date so it shows hour, minute, second and millisecond like this: HH:mm:ss.SSS
	$: formattedDate = formatter.format(currentDate);

	onMount(() => {
		interval = setInterval(() => {
			currentDate = new Date();
		}, 11);
	});

	onDestroy(() => {
		clearInterval(interval);
	});
</script>

<div class="flex justify-center items-center h-screen">
	<pre>{formattedDate}</pre>
</div>
