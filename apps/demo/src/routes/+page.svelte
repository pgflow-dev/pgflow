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
		<!-- Main Grid Layout -->
		<div class="grid gap-4 min-h-0 flex-1 main-layout">

			<!-- Header: Logo and Input (Desktop only) -->
			<div class="hidden md:flex items-center gap-4 pb-3 border-b border-border" style="grid-area: header">
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

			<!-- Code Panel -->
			<div class="overflow-hidden min-h-0" style="grid-area: code">
				<CodePanel
					{flowState}
					{selectedStep}
					{hoveredStep}
					on:step-selected={handleStepSelected}
					on:step-hovered={handleStepHovered}
				/>
			</div>

			<!-- Event Stream (collapsible) -->
			{#if flowState.events.length > 0}
				<div class="overflow-hidden max-h-[35vh] md:block hidden" style="grid-area: events">
					<Card class={eventStreamCollapsed ? 'h-12' : 'h-full flex flex-col'}>
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
							<CardContent class="flex-1 overflow-auto py-2 min-h-0">
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

			<!-- DAG Visualization -->
			<div class="overflow-hidden" style="grid-area: dag">
				<Card class="h-full p-0">
					<CardContent class="p-4 h-full">
						<div class="h-full md:h-[300px]">
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
			</div>

			<!-- Details Panel (Step Explanation or Welcome Guide) -->
			<div class="overflow-auto min-h-0 hidden md:block" style="grid-area: details">
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

	/* CSS Grid Layout: Desktop (>1400px) - 2 columns */
	.main-layout {
		grid-template-areas:
			"header  header"
			"code    dag"
			"code    details"
			"events  details";
		grid-template-columns: 1fr 520px;
		grid-template-rows: auto 1fr auto auto;
	}

	/* Tablet (769px-1400px): Stack vertically */
	@media (max-width: 1400px) and (min-width: 769px) {
		.main-layout {
			grid-template-areas:
				"header"
				"code"
				"events"
				"dag"
				"details";
			grid-template-columns: 1fr;
			grid-template-rows: auto 500px auto auto 1fr;
		}
	}

	/* Mobile (<768px): Simplified layout */
	@media (max-width: 768px) {
		.main-layout {
			grid-template-areas:
				"code"
				"dag"
				"details";
			grid-template-columns: 1fr;
			grid-template-rows: auto 220px 1fr;
		}
		/* Header becomes mobile sticky input (outside grid) */
		/* Events hidden via Tailwind hidden class */
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
