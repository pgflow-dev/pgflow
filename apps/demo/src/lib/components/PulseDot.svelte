<script lang="ts">
	import { pulseDots } from '$lib/stores/pulse-dots.svelte';

	// Component shows/hides based on global pulsing state
	const visible = $derived(pulseDots.pulsing);
</script>

{#if visible}
	<div class="pulse-dot"></div>
{/if}

<style>
	.pulse-dot {
		width: 10px;
		height: 10px;
		background: rgba(255, 159, 28, 1);
		border: 2px solid rgba(255, 255, 255, 0.9);
		border-radius: 50%;
		pointer-events: none;
		animation: pulse-dot 1s ease-out 3;
		box-shadow: 0 0 8px rgba(255, 159, 28, 0.8);

		/* Center in parent container */
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
	}

	@keyframes pulse-dot {
		0% {
			box-shadow:
				0 0 8px rgba(255, 159, 28, 0.8),
				0 0 0 0 rgba(255, 159, 28, 0.7);
			opacity: 1;
		}
		50% {
			box-shadow:
				0 0 12px rgba(255, 159, 28, 1),
				0 0 0 16px rgba(255, 159, 28, 0);
			opacity: 0.9;
		}
		100% {
			box-shadow:
				0 0 8px rgba(255, 159, 28, 0.8),
				0 0 0 0 rgba(255, 159, 28, 0);
			opacity: 1;
		}
	}
</style>
