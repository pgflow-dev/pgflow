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
	import { Badge } from '$lib/components/ui/badge';
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

	const isRunning = $derived(
		flowState.status === 'starting' || flowState.status === 'started'
	);
</script>

<WelcomeModal
	visible={showWelcome}
	hasRun={hasRunOnce}
	onRunFlow={handleRunFromModal}
	onDismiss={handleDismissModal}
/>

<div class="container mx-auto p-4 min-h-screen flex flex-col">
	<!-- Two-column layout: Input+DAG+Code | Explanation+Debug -->
	<div class="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] flex-1">
		<!-- Left Column: Combined Card + Event Stream -->
		<div class="flex flex-col pr-2 min-w-0">
			<!-- Combined Card: Logo + DAG + Input -->
			<Card class="p-0 mb-4">
				<CardContent class="p-4">
					<!-- Top: Logo and DAG side-by-side -->
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

					<!-- Bottom: Input Form (full width) -->
					<div class="flex gap-2">
						<Input
							type="url"
							bind:value={url}
							placeholder="Enter article URL"
							class="flex-1"
						/>
						<Button
							onclick={processArticle}
							disabled={isRunning}
							class={highlightButton ? 'button-pulse' : ''}
						>
							Process Article
						</Button>
					</div>
				</CardContent>
			</Card>

			<!-- Event Stream - Full height to bottom (hidden when no events) -->
			{#if flowState.events.length > 0}
				<Card class="flex-1 flex flex-col min-h-0 min-w-0 p-0">
					<CardHeader class="pb-0 pt-3">
						<CardTitle class="text-sm">Event Stream</CardTitle>
					</CardHeader>
					<CardContent class="flex-1 overflow-hidden py-2 min-h-0 min-w-0">
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

		<!-- Right Column: Explanation + Code Panel -->
		<div class="flex flex-col h-full pl-2">
			<!-- Explanation Panel -->
			<div class="mb-4">
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
					<Card>
						<CardContent class="text-center text-muted-foreground py-8">
							<p class="text-2xl mb-2">👇</p>
							<p class="text-lg">Click a step or flow to see details</p>
						</CardContent>
					</Card>
				{/if}
			</div>

			<!-- Code Panel with Clear Selection Button -->
			<div class="relative mb-4">
				{#if explanationVisible}
					<Button variant="outline" onclick={clearSelection} class="absolute top-2 right-2 z-10">
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
		</div>
	</div>
</div>

<style>
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
</style>
