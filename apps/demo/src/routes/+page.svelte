<script lang="ts">
	import { onDestroy } from 'svelte';
	import { pgflow } from '$lib/supabase';
	import { createFlowState } from '$lib/stores/pgflow-state-improved.svelte';
	import DAGVisualization from '$lib/components/DAGVisualization.svelte';
	import DebugPanel from '$lib/components/DebugPanel.svelte';
	import CodePanel from '$lib/components/CodePanel.svelte';
	import ExplanationPanel from '$lib/components/ExplanationPanel.svelte';
	import WelcomeModal from '$lib/components/WelcomeModal.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import type ArticleFlow from '../../supabase/functions/article_flow_worker/article_flow';

	const flowState = createFlowState<typeof ArticleFlow>(pgflow, 'article_flow', [
		'fetch_article',
		'summarize',
		'extract_keywords',
		'publish'
	]);

	let url = $state('https://enaix.github.io/2025/10/30/developer-verification.html');
	let selectedStep = $state<string | null>(null);
	let hoveredStep = $state<string | null>(null);
	let showFlowExplanation = $state(false);
	let hoverTimeout: number | undefined;

	// Welcome modal state
	let showWelcome = $state(true);
	let hasRunOnce = $state(false);
	let highlightButton = $state(false);

	// Show explanation panel when either a step is selected OR flow explanation is requested
	const explanationVisible = $derived(selectedStep !== null || showFlowExplanation);

	// Debug effect to track when selectedStep changes
	$effect(() => {
		console.log('[DEBUG] selectedStep changed to:', selectedStep);
		console.trace('[DEBUG] Stack trace for selectedStep change');
	});

	async function processArticle() {
		console.log('[DEBUG] processArticle called, selectedStep before:', selectedStep);
		try {
			const run = await flowState.startFlow({ url });
			console.log('Flow started:', run);
			console.log('Step states:', run?.stepStates);
			console.log('[DEBUG] processArticle finished, selectedStep after:', selectedStep);
		} catch (error) {
			console.error('Failed to start flow:', error);
		}
	}

	// Watch for flow completion to show post-run modal
	$effect(() => {
		if (!hasRunOnce && flowState.status === 'completed') {
			// First run completed - mark it and show completion modal
			hasRunOnce = true;
			showWelcome = true;
		}
	});

	function handleRunFromModal() {
		if (!hasRunOnce) {
			// First time - close modal and run
			showWelcome = false;
			setTimeout(() => {
				processArticle();
			}, 300);
		} else {
			// Running again - just close modal and run
			showWelcome = false;
			processArticle();
		}
	}

	function handleDismissModal() {
		showWelcome = false;
		// After dismissing completion modal, briefly highlight the Process Article button
		if (hasRunOnce) {
			setTimeout(() => {
				highlightButton = true;
				// Remove highlight after animation completes
				setTimeout(() => {
					highlightButton = false;
				}, 2000);
			}, 300);
		}
	}

	function handleStepSelected(event: CustomEvent<{ stepSlug: string | null }>) {
		const clickedStep = event.detail.stepSlug;
		console.log('Main page: handleStepSelected called with:', clickedStep);

		if (clickedStep === 'flow_config') {
			// Clicking flow config: select it and show flow explanation
			if (selectedStep === 'flow_config') {
				// Toggle off
				selectedStep = null;
				showFlowExplanation = false;
			} else {
				selectedStep = 'flow_config';
				showFlowExplanation = true;
			}
			console.log('Main page: Flow config toggled, showFlowExplanation:', showFlowExplanation);
		} else if (selectedStep === clickedStep) {
			// Toggle behavior: if clicking the same step, deselect it
			selectedStep = null;
			showFlowExplanation = false;
			console.log('Main page: Toggled off - deselected step');
		} else {
			// Select a different step
			selectedStep = clickedStep;
			showFlowExplanation = false;
			console.log('Main page: Selected step:', selectedStep);
		}
	}

	function handleStepHovered(event: CustomEvent<{ stepSlug: string | null }>) {
		const newHoveredStep = event.detail.stepSlug;

		// Clear any pending timeout
		if (hoverTimeout !== undefined) {
			clearTimeout(hoverTimeout);
			hoverTimeout = undefined;
		}

		if (newHoveredStep !== null) {
			// Immediately set hover when entering
			hoveredStep = newHoveredStep;
		} else {
			// Delay clearing hover when leaving (prevents flicker)
			hoverTimeout = window.setTimeout(() => {
				hoveredStep = null;
				hoverTimeout = undefined;
			}, 110);
		}
	}

	function closeExplanation() {
		// Closing explanation should clear both step selection and flow explanation
		selectedStep = null;
		showFlowExplanation = false;
	}

	function clearSelection() {
		selectedStep = null;
		showFlowExplanation = false;
	}

	// Automatic cleanup on unmount
	onDestroy(() => flowState.dispose());

	const isRunning = $derived(flowState.status === 'starting' || flowState.status === 'started');
</script>

<WelcomeModal
	visible={showWelcome}
	hasRun={hasRunOnce}
	onRunFlow={handleRunFromModal}
	onDismiss={handleDismissModal}
/>

<!-- Sticky Contact CTA Banner -->
<a
	href="https://pgflow.dev/author/"
	target="_blank"
	rel="noopener noreferrer"
	class="sticky top-0 z-50 block w-full contact-banner transition-all duration-200 shadow-md"
>
	<div class="banner-content mx-auto py-2 px-4">
		<p class="text-sm font-medium text-white text-center">
			<span class="hidden md:inline">💬 Questions about pgflow? → Book a call or send an email</span
			>
			<span class="md:hidden">💬 Questions? Contact us</span>
		</p>
	</div>
</a>

<div class="page-container">
	<div class="page-content">
		<!-- Two-column layout: Desktop = 2 cols, Mobile = 1 col (code only) -->
		<div class="main-layout">
			<!-- Left Column: Combined Card + Event Stream (Desktop only) -->
			<div class="left-column">
				<!-- Desktop: Combined Card: Logo + DAG + Input -->
				<Card class="p-0 mb-4 flex-shrink-0 hidden md:block">
					<CardContent class="p-4">
						<!-- Desktop: Logo and DAG side-by-side -->
						<div class="grid grid-cols-[0.8fr_1.2fr] gap-4 mb-4">
							<!-- Left: Logo and Title -->
							<div class="flex flex-col items-center justify-center">
								<img src="/pgflow-logo-dark.svg" alt="pgflow" class="h-28 mb-3" />
								<h1 class="text-xl font-bold mb-1">pgflow Demo</h1>
								<p class="text-sm font-semibold text-muted-foreground text-center px-2">
									Dead-simple workflow orchestration for Supabase
								</p>
							</div>

							<!-- Right: DAG Visualization -->
							<div class="h-[220px]">
								<DAGVisualization
									{flowState}
									{selectedStep}
									{hoveredStep}
									on:step-selected={handleStepSelected}
									on:step-hovered={handleStepHovered}
								/>
							</div>
						</div>

						<!-- Input Form (full width) -->
						<div class="flex gap-2">
							<Input type="url" bind:value={url} placeholder="Enter article URL" class="flex-1" />
							<Button
								onclick={processArticle}
								disabled={isRunning}
								class={highlightButton ? 'button-pulse cursor-pointer' : 'cursor-pointer'}
							>
								Process Article
							</Button>
						</div>
					</CardContent>
				</Card>

				<!-- Event Stream - Full height to bottom (hidden when no events) - Desktop only -->
				{#if flowState.events.length > 0}
					<Card class="hidden md:flex flex-1 flex-col min-h-0 p-0 overflow-hidden">
						<CardHeader class="pb-0 pt-3 flex-shrink-0">
							<CardTitle class="text-sm">Event Stream</CardTitle>
						</CardHeader>
						<CardContent class="flex-1 overflow-hidden py-2 min-h-0">
							<DebugPanel
								{flowState}
								{selectedStep}
								{hoveredStep}
								on:step-selected={handleStepSelected}
								on:step-hovered={handleStepHovered}
							/>
						</CardContent>
					</Card>
				{/if}
			</div>

			<!-- Right Column: Code Panel + DAG (Mobile) + Explanation -->
			<div class="right-column">
				<!-- Code Panel with Clear Selection Button -->
				<div class="relative flex-shrink-0 mobile-code-wrapper">
					{#if explanationVisible}
						<Button
							variant="outline"
							onclick={clearSelection}
							class="absolute top-2 right-2 z-10 hidden md:block cursor-pointer"
						>
							✕ Clear Selection
						</Button>
					{/if}
					<CodePanel
						{flowState}
						{selectedStep}
						{hoveredStep}
						on:step-selected={handleStepSelected}
						on:step-hovered={handleStepHovered}
					/>
				</div>

				<!-- Mobile: DAG below code - fills all remaining space -->
				<div class="md:hidden mobile-dag-container">
					<DAGVisualization
						{flowState}
						{selectedStep}
						{hoveredStep}
						on:step-selected={handleStepSelected}
						on:step-hovered={handleStepHovered}
					/>
				</div>

				<!-- Explanation Panel - Desktop: fills remaining space, Mobile: fixed at bottom -->
				<div class="flex-1 min-h-0 hidden md:block">
					{#if explanationVisible}
						<ExplanationPanel
							{selectedStep}
							{hoveredStep}
							{flowState}
							visible={true}
							on:close={closeExplanation}
							on:step-selected={handleStepSelected}
							on:step-hovered={handleStepHovered}
						/>
					{:else}
						<Card class="h-full flex items-center justify-center">
							<CardContent class="text-center text-muted-foreground py-8">
								<p class="text-2xl mb-2">👆</p>
								<p class="text-lg">Click a step or flow to see details</p>
							</CardContent>
						</Card>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Mobile: Sticky bottom input + button -->
<div class="mobile-sticky-input md:hidden bg-card border-t border-border">
	<div class="flex gap-2 p-3">
		<Input type="url" bind:value={url} placeholder="Enter article URL" class="flex-1" />
		<Button
			onclick={processArticle}
			disabled={isRunning}
			class={highlightButton ? 'button-pulse cursor-pointer' : 'cursor-pointer'}
		>
			Process
		</Button>
	</div>
</div>

<!-- Mobile: Bottom slide-up Explanation Panel -->
{#if explanationVisible}
	<div class="mobile-explanation-overlay md:hidden" onclick={closeExplanation}></div>
	<div class="mobile-explanation-panel md:hidden">
		<ExplanationPanel
			{selectedStep}
			{hoveredStep}
			{flowState}
			visible={true}
			on:close={closeExplanation}
			on:step-selected={handleStepSelected}
			on:step-hovered={handleStepHovered}
		/>
	</div>
{/if}

<style>
	.page-container {
		/* Calculate height: full viewport minus banner height (44px: 2*8px padding + 28px content) */
		height: calc(100vh - 44px);
		max-height: calc(100vh - 44px);
		overflow: hidden; /* Prevent page scroll */
		padding: 1rem;
		container-type: size;
		display: flex;
		justify-content: center;
	}

	/* Mobile: Remove padding, code touches edges */
	@media (max-width: 768px) {
		.page-container {
			padding: 0;
			height: calc(100vh - 44px); /* Ensure full height accounting for banner */
		}
	}

	.page-content {
		width: 100%;
		max-width: 1440px;
		height: 100%;
	}

	/* Desktop: Two columns using flexbox */
	.main-layout {
		display: flex;
		height: 100%;
		gap: 1rem;
	}

	.left-column {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow: hidden;
	}

	.right-column {
		flex: 0 0 auto;
		width: 720px;
		min-width: 720px;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
	}

	/* Mobile: Single column, hide left, right takes full width */
	@media (max-width: 768px) {
		.main-layout {
			gap: 0;
		}

		.left-column {
			display: none;
		}

		.right-column {
			flex: 1;
			width: 100%;
			min-width: 0;
		}

		.mobile-code-wrapper {
			flex-shrink: 0;
		}

		.mobile-dag-container {
			flex: 1;
			min-height: 0;
			background: #0d1117;
			display: flex;
			align-items: center; /* Center DAG vertically */
			justify-content: center; /* Center DAG horizontally */
		}

		/* DAG component should have a fixed reasonable height on mobile */
		.mobile-dag-container :global(.dag-container) {
			height: 220px !important;
			width: 100%;
		}
	}

	/* Contact banner using pgflow palette */
	:global(.contact-banner) {
		background: linear-gradient(135deg, #007b6e 0%, #9979d3 100%);
	}

	.banner-content {
		width: 100%;
		max-width: 1440px; /* Match page content max-width */
	}

	:global(.contact-banner:hover) {
		background: linear-gradient(135deg, #00574d 0%, #7d5eb8 100%);
	}

	:global(.button-pulse) {
		animation: button-pulse 0.6s ease-in-out 4;
	}

	@keyframes button-pulse {
		0%,
		100% {
			box-shadow: 0 0 0 0 rgba(88, 166, 255, 1);
			transform: scale(1);
		}
		50% {
			box-shadow: 0 0 0 15px rgba(88, 166, 255, 0);
			transform: scale(1.1);
		}
	}

	/* Mobile: Bottom slide-up panel */
	.mobile-explanation-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 100;
		animation: fadeIn 0.2s ease-out;
	}

	.mobile-explanation-panel {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		max-height: 70vh;
		z-index: 101;
		animation: slideUp 0.3s ease-out;
		overflow: hidden;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes slideUp {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}

	/* Mobile: Sticky input at bottom */
	.mobile-sticky-input {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 50;
		box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.3);
	}
</style>
