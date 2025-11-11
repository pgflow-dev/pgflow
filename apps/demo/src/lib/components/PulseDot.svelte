<script lang="ts">
	import { pulseDots } from '$lib/stores/pulse-dots.svelte';

	interface Props {
		scale?: number; // Optional scale factor for DAG nodes
	}

	let { scale = 1 }: Props = $props();

	// Component shows/hides based on global pulsing state
	const visible = $derived(pulseDots.pulsing);
	const exploding = $derived(pulseDots.exploding);

	// Calculate container scale style
	const containerStyle = $derived(scale !== 1 ? `transform: scale(${scale})` : '');
</script>

{#if visible}
	<div class="pulse-dot-container" style={containerStyle}>
		<div class="pulse-dot" class:exploding></div>
	</div>
{/if}

<style>
	.pulse-dot-container {
		/* Position container in center of parent */
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		pointer-events: none;
	}

	.pulse-dot {
		width: 10px;
		height: 10px;
		background: rgba(255, 255, 255, 0.5);
		border: 2px solid rgba(255, 255, 255, 0.6);
		border-radius: 50%;
		pointer-events: none;
		box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);

		/* Center in container */
		position: relative;
		transform: translate(-50%, -50%);
		top: 50%;
		left: 50%;

		/* Normal pulsing while visible */
		animation: pulse-normal 1s ease-out infinite;
	}

	/* When exiting, switch to explosion animation */
	.pulse-dot.exploding {
		animation: pulse-explode 1s ease-out forwards;
	}

	/* Normal pulse animation - loops */
	@keyframes pulse-normal {
		0% {
			box-shadow:
				0 0 8px rgba(255, 255, 255, 0.5),
				0 0 0 0 rgba(255, 255, 255, 0.5);
			transform: translate(-50%, -50%) scale(1);
		}
		50% {
			box-shadow:
				0 0 10px rgba(255, 255, 255, 0.8),
				0 0 0 10px rgba(255, 255, 255, 0.4);
			transform: translate(-50%, -50%) scale(1.05);
		}
		100% {
			box-shadow:
				0 0 8px rgba(255, 255, 255, 0.5),
				0 0 0 0 rgba(255, 255, 255, 0);
			transform: translate(-50%, -50%) scale(1);
		}
	}

	/* Explosion animation - one big pulse with fade out */
	@keyframes pulse-explode {
		0% {
			box-shadow:
				0 0 8px rgba(255, 255, 255, 0.5),
				0 0 0 0 rgba(255, 255, 255, 0.5);
			transform: translate(-50%, -50%) scale(1);
			opacity: 0.6;
		}
		30% {
			box-shadow:
				0 0 12px rgba(255, 255, 255, 0.6),
				0 0 0 12px rgba(255, 255, 255, 0.4);
			transform: translate(-50%, -50%) scale(1.1);
			opacity: 0.2;
		}
		60% {
			box-shadow:
				0 0 14px rgba(255, 255, 255, 0.4),
				0 0 0 16px rgba(255, 255, 255, 0.2);
			transform: translate(-50%, -50%) scale(1.2);
			opacity: 0.1;
		}
		100% {
			box-shadow:
				0 0 16px rgba(255, 255, 255, 0),
				0 0 0 20px rgba(255, 255, 255, 0);
			transform: translate(-50%, -50%) scale(1.3);
			opacity: 0;
		}
	}
</style>
