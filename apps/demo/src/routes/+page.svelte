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

	// Event stream collapsed state
	let eventStreamCollapsed = $state(false);

	function toggleEventStream() {
		eventStreamCollapsed = !eventStreamCollapsed;
	}
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
		<!-- Header: Logo and Input (Desktop only) -->
		<div class="header-section hidden md:flex">
			<div class="flex items-center gap-3">
				<img src="/pgflow-logo-dark.svg" alt="pgflow" class="h-12" />
				<div>
					<h1 class="text-lg font-bold">pgflow Demo</h1>
					<p class="text-xs text-muted-foreground">Dead-simple workflow orchestration for Supabase</p>
				</div>
			</div>
			<div class="flex gap-2 flex-1 max-w-md ml-auto">
				<Input type="url" bind:value={url} placeholder="Enter article URL" class="flex-1" />
				<Button
					onclick={processArticle}
					disabled={isRunning}
					class={highlightButton ? 'button-pulse cursor-pointer' : 'cursor-pointer'}
				>
					Process Article
				</Button>
			</div>
			{#if explanationVisible}
				<Button
					variant="outline"
					onclick={clearSelection}
					class="ml-3 cursor-pointer"
				>
					✕ Clear Selection
				</Button>
			{/if}
		</div>

		<!-- Main Layout: Code + Event Stream (left) | DAG & Details (right) -->
		<div class="main-layout">
			<!-- Left Column: Code Panel (HERO) + Event Stream -->
			<div class="left-column">
				<div class="code-panel-container">
					<CodePanel
						{flowState}
						{selectedStep}
						{hoveredStep}
						on:step-selected={handleStepSelected}
						on:step-hovered={handleStepHovered}
					/>
				</div>

				<!-- Event Stream (collapsible, bottom of left column) -->
				{#if flowState.events.length > 0}
					<div class="event-stream-section-left">
						<Card class={eventStreamCollapsed ? 'collapsed' : 'expanded'}>
							<CardHeader
								class="pb-0 pt-3 flex-shrink-0 cursor-pointer hover:bg-accent/50 transition-colors"
								onclick={toggleEventStream}
							>
								<div class="flex items-center justify-between">
									<CardTitle class="text-sm">Event Stream</CardTitle>
									<span class="text-xs text-muted-foreground">
										{eventStreamCollapsed ? '▶' : '▼'} Click to {eventStreamCollapsed ? 'expand' : 'collapse'}
									</span>
								</div>
							</CardHeader>
							{#if !eventStreamCollapsed}
								<CardContent class="event-stream-content py-2">
									<DebugPanel
										{flowState}
										{selectedStep}
										{hoveredStep}
										on:step-selected={handleStepSelected}
										on:step-hovered={handleStepHovered}
									/>
								</CardContent>
							{/if}
						</Card>
					</div>
				{/if}
			</div>

			<!-- Right Column: DAG (top) + Step Details (bottom) -->
			<div class="right-column">
				<!-- DAG Visualization (bigger) -->
				<Card class="dag-card p-0 flex-shrink-0 hidden md:block">
					<CardContent class="p-4">
						<div class="h-[300px]">
							<DAGVisualization
								{flowState}
								{selectedStep}
								{hoveredStep}
								on:step-selected={handleStepSelected}
								on:step-hovered={handleStepHovered}
							/>
						</div>
					</CardContent>
				</Card>

				<!-- Step Details Panel (fills remaining space) -->
				<div class="flex-1 min-h-0 hidden md:block mt-3">
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
						<Card class="h-full welcome-guide">
							<CardHeader>
								<CardTitle class="text-base">Welcome to pgflow Interactive Demo</CardTitle>
							</CardHeader>
							<CardContent class="space-y-4 text-sm">
								<div>
									<h3 class="font-semibold mb-2 flex items-center gap-2">
										<span class="text-lg">🎯</span> What You'll See
									</h3>
									<p class="text-muted-foreground leading-relaxed">
										A real article processing workflow that fetches content, runs AI summarization and
										keyword extraction in parallel, then publishes results—all orchestrated by pgflow.
									</p>
								</div>

								<div>
									<h3 class="font-semibold mb-2 flex items-center gap-2">
										<span class="text-lg">🔍</span> How to Explore
									</h3>
									<div class="space-y-2 text-muted-foreground">
										<div class="flex items-start gap-2">
											<span class="text-primary font-mono text-xs bg-secondary px-2 py-0.5 rounded mt-0.5">Click</span>
											<span>Steps in the code or DAG to see inputs, outputs, and dependencies</span>
										</div>
										<div class="flex items-start gap-2">
											<span class="text-primary font-mono text-xs bg-secondary px-2 py-0.5 rounded mt-0.5">Click</span>
											<span>"new Flow" to understand retry configuration and reliability settings</span>
										</div>
										<div class="flex items-start gap-2">
											<span class="text-primary font-mono text-xs bg-secondary px-2 py-0.5 rounded mt-0.5">Watch</span>
											<span>Event stream at bottom for real-time execution data</span>
										</div>
									</div>
								</div>

								<div>
									<h3 class="font-semibold mb-2 flex items-center gap-2">
										<span class="text-lg">⚡</span> Why pgflow?
									</h3>
									<ul class="space-y-1.5 text-muted-foreground">
										<li class="flex items-start gap-2">
											<span class="text-primary">•</span>
											<span>Dead-simple TypeScript DSL—no complex YAML or config files</span>
										</li>
										<li class="flex items-start gap-2">
											<span class="text-primary">•</span>
											<span>Built-in retry logic and error handling</span>
										</li>
										<li class="flex items-start gap-2">
											<span class="text-primary">•</span>
											<span>Real-time observability with streaming events</span>
										</li>
										<li class="flex items-start gap-2">
											<span class="text-primary">•</span>
											<span>Native Postgres/Supabase—no external orchestrators</span>
										</li>
									</ul>
								</div>

								<div class="pt-2 border-t border-border">
									<p class="text-muted-foreground text-xs text-center">
										👆 Click any step in the code or DAG to get started
									</p>
								</div>
							</CardContent>
						</Card>
					{/if}
				</div>

				<!-- Mobile: DAG below step details -->
				<div class="md:hidden mobile-dag-container mt-3">
					<DAGVisualization
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
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* Header section with logo and input */
	.header-section {
		flex-shrink: 0;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 0;
		border-bottom: 1px solid hsl(var(--border));
		margin-bottom: 0.5rem;
	}

	/* Main layout: Code + Event Stream (left) | DAG & Details (right) */
	.main-layout {
		display: flex;
		flex: 1;
		min-height: 0;
		gap: 1rem;
	}

	.left-column {
		flex: 1 1 auto;
		min-width: 850px; /* Code panel needs generous space */
		display: flex;
		flex-direction: column;
		overflow: hidden;
		gap: 0.75rem;
	}

	.code-panel-container {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	/* Event stream in left column (bottom) */
	.event-stream-section-left {
		flex-shrink: 0;
		max-height: 35vh;
		overflow: hidden;
	}

	.event-stream-section-left .collapsed {
		max-height: 3rem;
	}

	.event-stream-section-left .expanded {
		display: flex;
		flex-direction: column;
		max-height: 35vh;
	}

	.event-stream-section-left .expanded .event-stream-content {
		flex: 1;
		overflow: auto;
		min-height: 0;
	}

	.right-column {
		flex: 0 0 auto;
		width: 520px;
		min-width: 520px;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
	}

	.dag-card {
		flex-shrink: 0;
	}

	/* Tablet/Small Desktop (769px-1400px): Stack columns vertically */
	@media (max-width: 1400px) and (min-width: 769px) {
		.main-layout {
			flex-direction: column;
			gap: 1rem;
		}

		.left-column {
			min-width: 0;
			flex: 0 0 auto;
			height: auto;
			max-height: none; /* Remove height limit */
		}

		.code-panel-container {
			height: 500px; /* Fixed height for code when stacked */
		}

		.event-stream-section-left {
			max-height: 250px; /* Smaller event stream when stacked */
		}

		.event-stream-section-left .expanded {
			max-height: 250px;
		}

		.right-column {
			flex: 1;
			width: 100%;
			min-width: 0;
		}
	}

	/* Mobile: Single column, simplified layout */
	@media (max-width: 768px) {
		.main-layout {
			flex-direction: column;
			gap: 0;
		}

		.left-column {
			flex: 0 0 auto;
			height: auto;
			min-width: 0;
		}

		.right-column {
			flex: 1;
			width: 100%;
			min-width: 0;
		}

		.event-stream-section-left {
			display: none; /* Hide on mobile */
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

	/* Welcome guide card styling */
	:global(.welcome-guide) {
		overflow-y: auto;
	}

	:global(.welcome-guide h3) {
		color: hsl(var(--foreground));
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
