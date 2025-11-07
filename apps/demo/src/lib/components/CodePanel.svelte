<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	import { codeToHtml } from 'shiki';
	import { FLOW_CODE, getStepFromLine, FLOW_SECTIONS } from '$lib/data/flow-code';
	import type { createFlowState } from '$lib/stores/pgflow-state-improved.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import PulseDot from '$lib/components/PulseDot.svelte';

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
	let highlightedSections = $state<Record<string, string>>({});
	let highlightedSectionsExpanded = $state<Record<string, string>>({});
	let codeContainer: HTMLElement | undefined = $state(undefined);
	let isMobile = $state(false);

	// Section order for mobile rendering
	const SECTION_ORDER = ['flow_config', 'fetch_article', 'summarize', 'extract_keywords', 'publish'];

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

		// If flow has started but this step has no status yet, don't show indicator
		if (!status) {
			return null;
		}

		// Only show indicators for started and completed
		if (status === 'started' || status === 'completed') {
			return status;
		}

		return null;
	}

	onMount(async () => {
		// Detect mobile
		isMobile = window.innerWidth < 768;
		window.addEventListener('resize', () => {
			isMobile = window.innerWidth < 768;
		});

		// Generate syntax highlighted HTML for full code
		highlightedCode = await codeToHtml(FLOW_CODE, {
			lang: 'typescript',
			theme: 'night-owl',
			transformers: [
				{
					line(node) {
						node.properties.class = 'line';
					}
				}
			]
		});

		// Generate separate highlighted sections
		for (const [slug, section] of Object.entries(FLOW_SECTIONS)) {
			// Compact code for main mobile panel
			highlightedSections[slug] = await codeToHtml(section.code, {
				lang: 'typescript',
				theme: 'night-owl'
			});

			// Expanded code for explanation panel (mobile-selected)
			const expandedCode = section.mobileCode || section.code;
			highlightedSectionsExpanded[slug] = await codeToHtml(expandedCode, {
				lang: 'typescript',
				theme: 'night-owl'
			});
		}

		// Add click handlers to lines after rendering
		setupClickHandlersDelayed();
	});

	function setupClickHandlersDelayed() {
		setTimeout(() => {
			if (codeContainer) {
				setupClickHandlers();
			}
		}, 50);
	}

	// Re-setup handlers when view changes
	$effect(() => {
		const mobile = isMobile;
		const selected = selectedStep;

		// Setup handlers for full code view (desktop or mobile with no selection)
		if (codeContainer && (!mobile || !selected || selected === 'flow_config')) {
			setupClickHandlersDelayed();
		}
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
				const clickHandler = () => {
					console.log('CodePanel: Line clicked, stepSlug:', stepSlug);
					// Clear hover state before navigating
					dispatch('step-hovered', { stepSlug: null });

					// All sections (including flow_config) dispatch their slug
					dispatch('step-selected', { stepSlug });
				};
				line.addEventListener('click', clickHandler);

				// Hover handlers - dispatch hover events (desktop only)
				if (!isMobile) {
					line.addEventListener('mouseenter', () => {
						dispatch('step-hovered', { stepSlug });
					});

					line.addEventListener('mouseleave', () => {
						dispatch('step-hovered', { stepSlug: null });
					});
				}
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
	{#if isMobile && selectedStep}
		<!-- Mobile: Show only selected section in explanation panel (expanded version) -->
		<div class="code-panel mobile-selected">
			{#if highlightedSectionsExpanded[selectedStep]}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html highlightedSectionsExpanded[selectedStep]}
			{/if}
		</div>
	{:else if isMobile}
		<!-- Mobile: Show all sections as separate blocks -->
		<div class="code-panel mobile-sections">
			{#each SECTION_ORDER as sectionSlug, index (sectionSlug)}
				{@const stepStatus = getStepStatus(sectionSlug)}
				{@const isDimmed = selectedStep && sectionSlug !== selectedStep}
				{@const isFirst = index === 0}
				{@const isLast = index === SECTION_ORDER.length - 1}
				<div
					class="code-section"
					class:section-dimmed={isDimmed}
					class:section-selected={selectedStep === sectionSlug}
					class:section-first={isFirst}
					class:section-last={isLast}
					data-step={sectionSlug}
					onclick={() => dispatch('step-selected', { stepSlug: sectionSlug })}
					role="button"
					tabindex="0"
				>
					<!-- Status indicator: left border -->
					{#if stepStatus}
						<div class="section-status-border status-{stepStatus}"></div>
					{/if}

					<!-- Pulse dot (centered) -->
					<div class="pulse-dot-container">
						<PulseDot />
					</div>

					<!-- Code content -->
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html highlightedSections[sectionSlug]}
				</div>
			{/each}
		</div>
	{:else}
		<!-- Desktop: Show full code (unchanged) -->
		<div class="code-panel" bind:this={codeContainer}>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html highlightedCode}

			<!-- Step status indicators -->
			{#each stepBlocks as block (block.stepSlug)}
				{@const stepStatus = getStepStatus(block.stepSlug)}
				{#if stepStatus}
					{@const blockHeight = (block.endLine - block.startLine + 1) * 1.5}
					{@const blockTop = (block.startLine - 1) * 1.5}
					{@const iconTop = blockTop + blockHeight / 2}
					{@const isDimmed = selectedStep && block.stepSlug !== selectedStep}

					<!-- Desktop: Icon badge -->
					<div
						class="step-status-container hidden md:block"
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
	{/if}
</div>

<style>
	.code-panel-wrapper {
		position: relative;
	}

	.code-panel {
		overflow-x: auto;
		border-radius: 5px;
	}

	.code-panel.mobile-selected {
		/* Compact height when showing only selected step on mobile */
		min-height: auto;
		font-size: 13px;
		background: #0d1117;
		position: relative;
	}

	.code-panel.mobile-sections {
		/* Mobile: Container for separate section blocks */
		font-size: 11px;
		border-radius: 0;
	}

	/* Mobile: Smaller font, no border radius (touches edges) */
	@media (max-width: 768px) {
		.code-panel {
			font-size: 11px;
			border-radius: 0;
		}
	}

	/* Mobile: Individual code section */
	.code-section {
		position: relative;
		cursor: pointer;
		transition:
			opacity 200ms ease,
			background-color 200ms ease;
	}

	.code-section.section-dimmed {
		opacity: 0.4;
	}

	.code-section.section-selected {
		background-color: rgba(88, 166, 255, 0.22);
		opacity: 1;
	}

	/* Status border for mobile sections */
	.section-status-border {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 2px;
		pointer-events: none;
	}

	.section-status-border.status-completed {
		background: #10b981; /* Green */
	}

	.section-status-border.status-started {
		background: #3b82f6; /* Blue */
	}

	/* Pulse dot container - centers the dot */
	.pulse-dot-container {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		pointer-events: none;
		z-index: 10;
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
			padding: 16px 8px;
		}
	}

	/* Mobile sections: Seamless styling */
	.mobile-sections .code-section :global(pre) {
		margin: 0;
		padding: 16px 8px;
		background: #0d1117 !important;
		border-radius: 0;
		line-height: 1.5;
	}

	/* First section: keep top padding, remove bottom */
	.mobile-sections .code-section.section-first :global(pre) {
		padding-bottom: 0;
	}

	/* Middle sections: remove all vertical padding */
	.mobile-sections .code-section:not(.section-first):not(.section-last) :global(pre) {
		padding-top: 0;
		padding-bottom: 0;
	}

	/* Last section: keep bottom padding, remove top */
	.mobile-sections .code-section.section-last :global(pre) {
		padding-top: 0;
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

	/* Step status border (mobile - vertical bar) */
	.step-status-border {
		position: absolute;
		left: 0;
		width: 2px;
		pointer-events: none;
		transition: opacity 200ms ease;
		opacity: 1;
	}

	/* Status colors for border based on step status */
	.step-status-border.status-completed {
		background: #10b981; /* Green */
	}

	.step-status-border.status-started {
		background: #3b82f6; /* Blue */
	}

	.step-status-border.status-dimmed {
		opacity: 0.3;
	}
</style>
