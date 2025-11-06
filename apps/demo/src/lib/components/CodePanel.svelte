<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	import { codeToHtml } from 'shiki';
	import { FLOW_CODE, getStepFromLine, FLOW_SECTIONS } from '$lib/data/flow-code';
	import type { createFlowState } from '$lib/stores/pgflow-state-improved.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	interface Props {
		flowState: ReturnType<typeof createFlowState>;
		selectedStep: string | null;
		hoveredStep: string | null;
	}

	let { flowState, selectedStep, hoveredStep }: Props = $props();

	const dispatch = createEventDispatcher<{
		'step-selected': { stepSlug: string };
		'step-hovered': { stepSlug: string | null };
	}>();

	let highlightedCode = $state('');
	let codeContainer: HTMLElement | undefined = $state(undefined);

	// Calculate step blocks (groups of lines) for status icon positioning
	const stepBlocks = $derived.by(() => {
		const blocks: Array<{ stepSlug: string; startLine: number; endLine: number }> = [];

		for (const [stepSlug, section] of Object.entries(FLOW_SECTIONS)) {
			if (stepSlug === 'flow_config') continue; // Skip flow config
			if (section.startLine !== undefined && section.endLine !== undefined) {
				blocks.push({ stepSlug, startLine: section.startLine, endLine: section.endLine });
			}
		}

		return blocks;
	});

	// Helper to get status for a step badge
	function getStepStatus(stepSlug: string): string | null {
		const status = flowState.stepStatuses[stepSlug];
		const hasFlowStarted = flowState.status !== 'idle';

		// Don't show badge if flow hasn't started yet
		if (!hasFlowStarted) {
			return null;
		}

		// If flow has started but this step has no status yet, show as created
		if (!status) {
			return 'created';
		}

		return status;
	}

	onMount(async () => {
		// Generate syntax highlighted HTML using Shiki
		highlightedCode = await codeToHtml(FLOW_CODE, {
			lang: 'typescript',
			theme: 'night-owl',
			transformers: [
				{
					line(node) {
						// Add .line class to each line for click handling
						node.properties.class = 'line';
					}
				}
			]
		});

		// Add click handlers to lines after rendering - need small delay
		setTimeout(() => {
			if (codeContainer) {
				setupClickHandlers();
			}
		}, 50);
	});

	function setupClickHandlers() {
		if (!codeContainer) return;

		// Find all line elements
		const lines = codeContainer.querySelectorAll('.line');
		lines.forEach((line, index) => {
			const lineNumber = index + 1;
			const stepSlug = getStepFromLine(lineNumber);

			// Set data-step attribute for all lines (including flow_config)
			if (stepSlug) {
				(line as HTMLElement).setAttribute('data-step', stepSlug);
				(line as HTMLElement).setAttribute('data-line', String(lineNumber));
				(line as HTMLElement).style.cursor = 'pointer';

				// Click handler
				line.addEventListener('click', () => {
					console.log('CodePanel: Line clicked, stepSlug:', stepSlug);
					// Clear hover state before navigating
					dispatch('step-hovered', { stepSlug: null });

					// All sections (including flow_config) dispatch their slug
					dispatch('step-selected', { stepSlug });
				});

				// Hover handlers - dispatch hover events
				line.addEventListener('mouseenter', () => {
					dispatch('step-hovered', { stepSlug });
				});

				line.addEventListener('mouseleave', () => {
					dispatch('step-hovered', { stepSlug: null });
				});
			}
		});
	}

	// Update line highlighting and borders based on step status, selected, and hovered steps
	$effect(() => {
		// Explicitly track these dependencies
		const currentSelectedStep = selectedStep;
		const currentHoveredStep = hoveredStep;
		// Ensure reactivity to step status changes by accessing it
		void flowState.stepStatuses;

		if (!codeContainer) return;

		const lines = codeContainer.querySelectorAll('.line');
		lines.forEach((line) => {
			const stepSlug = (line as HTMLElement).getAttribute('data-step');
			(line as HTMLElement).classList.remove('line-selected', 'line-hovered', 'line-dimmed');

			if (stepSlug) {
				// Dimming: dim all lines except selected when selecting (including flow_config)
				if (currentSelectedStep && stepSlug !== currentSelectedStep) {
					(line as HTMLElement).classList.add('line-dimmed');
				}

				// Hovered state (hovering) - blue highlight, no dimming (including flow_config)
				if (currentHoveredStep && stepSlug === currentHoveredStep) {
					(line as HTMLElement).classList.add('line-hovered');
				}

				// Selected state (clicked) - blue background with dimming (not for flow_config)
				if (currentSelectedStep && stepSlug === currentSelectedStep) {
					(line as HTMLElement).classList.add('line-selected');
				}
			}
		});
	});
</script>

<div class="code-panel-wrapper">
	<div class="code-panel" bind:this={codeContainer}>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html highlightedCode}

		<!-- Step status icons overlaid on code blocks -->
		{#each stepBlocks as block (block.stepSlug)}
			{@const stepStatus = getStepStatus(block.stepSlug)}
			{#if stepStatus}
				{@const blockHeight = (block.endLine - block.startLine + 1) * 1.5}
				{@const blockTop = (block.startLine - 1) * 1.5}
				{@const iconTop = blockTop + blockHeight / 2}
				{@const isDimmed = selectedStep && block.stepSlug !== selectedStep}
				<div
					class="step-status-container"
					class:status-dimmed={isDimmed}
					data-step={block.stepSlug}
					data-start-line={block.startLine}
					style="top: calc({iconTop}em + 12px);"
				>
					<StatusBadge status={stepStatus} variant="icon-only" size="xl" />
				</div>
			{/if}
		{/each}
	</div>
</div>

<style>
	.code-panel-wrapper {
		position: relative;
	}

	.code-panel {
		overflow-x: auto;
		border-radius: 5px;
		font-size: 15px;
		background: #0d1117;
		position: relative;
	}

	/* Mobile: Smaller font, no border radius (touches edges) */
	@media (max-width: 768px) {
		.code-panel {
			font-size: 11px;
			border-radius: 0;
		}
	}

	/* Override Shiki's default pre styling */
	.code-panel :global(pre) {
		margin: 0;
		padding: 12px 0;
		background: #0d1117 !important;
		border-radius: 5px;
		line-height: 1.5;
	}

	/* Mobile: Smaller padding */
	@media (max-width: 768px) {
		.code-panel :global(pre) {
			padding: 8px 0;
		}
	}

	.code-panel :global(code) {
		font-family: 'Fira Code', 'Monaco', 'Menlo', 'Courier New', monospace;
	}

	/* Line styling */
	.code-panel :global(.line) {
		display: inline-block;
		width: 100%;
		padding: 0 12px;
		transition: background-color 0.2s ease;
	}

	/* Mobile: Smaller line padding */
	@media (max-width: 768px) {
		.code-panel :global(.line) {
			padding: 0 8px;
		}
	}

	/* Empty lines need content for background to show */
	.code-panel :global(.line:empty::after) {
		content: ' ';
		display: inline-block;
	}

	/* Clickable lines */
	.code-panel :global(.line[data-step]) {
		cursor: pointer;
	}

	/* Dimmed (when another step is selected) - lowest priority */
	.code-panel :global(.line-dimmed) {
		opacity: 0.4;
		transition: opacity 200ms ease;
	}

	/* Ensure non-dimmed lines also transition smoothly */
	.code-panel :global(.line) {
		transition:
			opacity 200ms ease,
			background-color 200ms ease;
	}

	/* Hover state - opaque blue highlight */
	.code-panel :global(.line-hovered) {
		background-color: rgba(88, 166, 255, 0.15) !important;
		opacity: 1 !important;
	}

	/* Selected step (clicked by user) - stronger blue background */
	.code-panel :global(.line-selected) {
		background-color: rgba(88, 166, 255, 0.22) !important;
		opacity: 1 !important;
	}

	/* Step status container */
	.step-status-container {
		position: absolute;
		right: 16px;
		transform: translateY(-50%);
		z-index: 10;
		pointer-events: none;
		transition: opacity 200ms ease;
	}

	/* Mobile: Smaller status icons, closer to edge */
	@media (max-width: 768px) {
		.step-status-container {
			right: 8px;
			transform: translateY(-50%) scale(0.6);
		}
	}

	/* Dimmed status icon (when another step is selected) */
	.step-status-container.status-dimmed {
		opacity: 0.4;
	}
</style>
