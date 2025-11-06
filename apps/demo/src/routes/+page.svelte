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
	const WELCOME_MODAL_ENABLED = true; // Set to true to enable welcome modal
	let showWelcome = $state(WELCOME_MODAL_ENABLED);
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

	function showPulseDots() {
		setTimeout(() => {
			const dots: HTMLElement[] = [];

			// DAG nodes - center
			let dagNodeCount = 0;
			document.querySelectorAll('.dag-node').forEach((el) => {
				const rect = el.getBoundingClientRect();
				const dot = document.createElement('div');
				dot.className = 'pulse-dot';

				// DEBUG: Shift first dot to identify it
				if (dagNodeCount === 0) {
					dot.style.left = `${rect.left + rect.width / 2 + 50}px`;
					dot.style.top = `${rect.top + rect.height / 2 + 10}px`;
				} else {
					dot.style.left = `${rect.left + rect.width / 2}px`;
					dot.style.top = `${rect.top + rect.height / 2}px`;
				}

				document.body.appendChild(dot);
				dots.push(dot);
				dagNodeCount++;
			});

			// Code step blocks - check if status borders exist, otherwise create dots at step positions
			const stepBlocks = document.querySelectorAll('.step-status-border');
			const codePanel = document.querySelector('.code-panel');

			if (stepBlocks.length > 0) {
				// Status borders exist, place dots horizontally centered on screen, vertically in middle of block
				stepBlocks.forEach((el) => {
					const rect = el.getBoundingClientRect();
					const dot = document.createElement('div');
					dot.className = 'pulse-dot';
					// Horizontally center on screen, vertically center in the block
					dot.style.left = `${window.innerWidth / 2}px`;
					dot.style.top = `${rect.top + rect.height / 2}px`;
					document.body.appendChild(dot);
					dots.push(dot);
				});
			} else if (codePanel) {
				// No status borders yet, find all lines for each step and calculate middle
				// Include flow_config and all step slugs
				const allSlugs = ['flow_config', 'fetch_article', 'summarize', 'extract_keywords', 'publish'];

				allSlugs.forEach((stepSlug) => {
					// Find all lines of this step to calculate the middle
					const stepLines = codePanel.querySelectorAll(`[data-step="${stepSlug}"]`);
					if (stepLines.length > 0) {
						const firstLine = stepLines[0];
						const lastLine = stepLines[stepLines.length - 1];
						const firstRect = firstLine.getBoundingClientRect();
						const lastRect = lastLine.getBoundingClientRect();

						// Only create dot if rects are valid (not 0,0)
						if (firstRect.top > 0 && lastRect.bottom > 0) {
							const dot = document.createElement('div');
							dot.className = 'pulse-dot';
							// Horizontally center on screen, vertically in middle of all step lines
							dot.style.left = `${window.innerWidth / 2}px`;
							dot.style.top = `${(firstRect.top + lastRect.bottom) / 2}px`;
							document.body.appendChild(dot);
							dots.push(dot);
						}
					}
				});
			}

			// Event stream button (mobile) - only if it has events and is visible
			const allButtons = Array.from(document.querySelectorAll('button'));
			const eventsButton = allButtons.find((btn) => {
				const text = btn.textContent?.trim() || '';
				return text.startsWith('Events') && !btn.disabled;
			});

			if (eventsButton) {
				const rect = eventsButton.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0) {
					const dot = document.createElement('div');
					dot.className = 'pulse-dot';
					// DEBUG: Shift this dot to identify it
					dot.style.left = `${rect.left + rect.width / 2 + 50}px`;
					dot.style.top = `${rect.top + rect.height / 2 + 10}px`;
					document.body.appendChild(dot);
					dots.push(dot);
				}
			}

			// Remove dots after 3 seconds
			setTimeout(() => {
				dots.forEach((dot) => dot.remove());
			}, 3000);
		}, 300);
	}

	function handleDismissModal() {
		showWelcome = false;
		// Show pulsing dots on all clickable elements after any modal dismiss
		showPulseDots();
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

	// Mobile events panel state
	let mobileEventsVisible = $state(false);

	function toggleMobileEvents() {
		mobileEventsVisible = !mobileEventsVisible;
	}
</script>

<WelcomeModal
	visible={showWelcome}
	hasRun={hasRunOnce}
	onRunFlow={handleRunFromModal}
	onDismiss={handleDismissModal}
/>

<div class="page-container">
	<div class="page-content">
		<!-- Main Grid Layout -->
		<div class="grid gap-0 min-h-0 flex-1 main-layout">
			<!-- Header: Sticky across all breakpoints -->
			<div
				class="sticky top-0 z-50 bg-background border-b border-border flex items-center gap-2 md:gap-4 px-3 h-11"
				style="grid-area: header"
			>
				<!-- Logo + branding -->
				<a href="https://pgflow.dev" class="flex items-center gap-1.5 md:gap-2">
					<img src="/pgflow-logo-dark.svg" alt="pgflow" class="h-5 md:h-8" />
					<span class="text-xs md:text-sm font-semibold">pgflow</span>
				</a>

				<div class="flex-1"></div>

				<!-- Desktop: URL input + buttons -->
				<div class="hidden md:flex gap-2 flex-1 max-w-md ml-auto">
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
						class="ml-3 cursor-pointer hidden md:flex"
					>
						✕ Clear Selection
					</Button>
				{/if}

				<!-- Mobile: Events + Process buttons -->
				<Button
					variant="ghost"
					size="sm"
					onclick={toggleMobileEvents}
					disabled={!flowState.events.length}
					class="md:hidden h-8 px-2 text-xs text-muted-foreground"
				>
					Events {flowState.events.length ? `(${flowState.events.length})` : ''}
				</Button>

				<Button
					size="sm"
					onclick={processArticle}
					disabled={isRunning}
					class="md:hidden h-8 px-3 text-xs {highlightButton ? 'button-pulse' : ''}"
				>
					Start
				</Button>
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

			<!-- Mobile: Code-to-DAG connector -->
			<div class="md:hidden bg-accent/30 border-y border-border" style="grid-area: info">
				<div class="px-3 py-3 text-xs text-muted-foreground text-center">
					<span class="text-foreground font-semibold">20 lines</span>
					<span class="mx-2">→</span>
					<span class="text-foreground font-semibold">4-step DAG</span>
					<span class="mx-2">•</span>
					<span>Parallel execution</span>
				</div>
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
									{eventStreamCollapsed ? '▶' : '▼'} Click to {eventStreamCollapsed
										? 'expand'
										: 'collapse'}
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

			<!-- Mobile: DAG only (explanation is overlay) | Desktop: DAG -->
			<div class="overflow-hidden h-full" style="grid-area: dag">
				<!-- Mobile: Always show DAG -->
				<div class="md:hidden h-full flex flex-col">
					<DAGVisualization
						{flowState}
						{selectedStep}
						{hoveredStep}
						on:step-selected={handleStepSelected}
						on:step-hovered={handleStepHovered}
					/>
				</div>

				<!-- Desktop: Always show DAG -->
				<Card class="hidden md:block h-full p-0">
					<CardContent class="p-4 h-full">
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
			</div>

			<!-- Desktop: Details Panel (Step Explanation or Welcome Guide) -->
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
										<span
											class="text-primary font-mono text-xs bg-secondary px-2 py-0.5 rounded mt-0.5"
											>Click</span
										>
										<span>Steps in the code or DAG to see inputs, outputs, and dependencies</span>
									</div>
									<div class="flex items-start gap-2">
										<span
											class="text-primary font-mono text-xs bg-secondary px-2 py-0.5 rounded mt-0.5"
											>Click</span
										>
										<span
											>"new Flow" to understand retry configuration and reliability settings</span
										>
									</div>
									<div class="flex items-start gap-2">
										<span
											class="text-primary font-mono text-xs bg-secondary px-2 py-0.5 rounded mt-0.5"
											>Watch</span
										>
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

<!-- Mobile: Explanation slide-up panel (covers everything except header) -->
{#if explanationVisible}
	<div class="fixed inset-0 bg-black/50 z-40 md:hidden" onclick={closeExplanation}></div>
	<div class="fixed inset-x-0 top-11 bottom-0 bg-card z-50 md:hidden flex flex-col">
		<!-- Code snippet for selected step or flow config (sticky) -->
		{#if selectedStep}
			<div
				class="bg-[#0d1117] px-0 py-0 text-xs overflow-x-auto border-b border-border flex-shrink-0"
			>
				<CodePanel
					{flowState}
					{selectedStep}
					hoveredStep={null}
					on:step-selected={() => {}}
					on:step-hovered={() => {}}
				/>
			</div>
		{/if}

		<!-- Explanation content (scrollable, no card wrapper) -->
		<div class="overflow-auto flex-1">
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
	</div>
{/if}

<!-- Mobile: Events slide-up panel -->
{#if mobileEventsVisible && flowState.events.length > 0}
	<div class="fixed inset-0 bg-black/50 z-40 md:hidden" onclick={toggleMobileEvents}></div>
	<div
		class="fixed inset-x-0 bottom-0 bg-card max-h-[70vh] z-50 md:hidden rounded-t-xl shadow-2xl animate-slide-up"
	>
		<div class="flex items-center justify-between p-4 border-b">
			<h3 class="font-semibold text-sm">Event Stream</h3>
			<button onclick={toggleMobileEvents} class="text-muted-foreground">✕</button>
		</div>
		<div class="overflow-auto p-4 max-h-[calc(70vh-60px)]">
			<DebugPanel
				{flowState}
				{selectedStep}
				{hoveredStep}
				on:step-selected={handleStepSelected}
				on:step-hovered={handleStepHovered}
			/>
		</div>
	</div>
{/if}

<style>
	.page-container {
		height: 100vh;
		max-height: 100vh;
		overflow: hidden;
		padding: 1rem;
		container-type: size;
		display: flex;
		justify-content: center;
	}

	/* Mobile: Remove padding */
	@media (max-width: 768px) {
		.page-container {
			padding: 0;
		}
	}

	.page-content {
		width: 100%;
		max-width: 1440px;
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	@media (min-width: 769px) {
		.page-content {
			gap: 1rem;
		}
	}

	/* CSS Grid Layout: Desktop (>1400px) - 2 columns */
	.main-layout {
		grid-template-areas:
			'header  header'
			'code    dag'
			'code    details'
			'events  details';
		grid-template-columns: 1fr 520px;
		grid-template-rows: auto 1fr auto auto;
		gap: 1rem;
	}

	/* Tablet (769px-1400px): Stack vertically */
	@media (max-width: 1400px) and (min-width: 769px) {
		.main-layout {
			grid-template-areas:
				'header'
				'code'
				'events'
				'dag'
				'details';
			grid-template-columns: 1fr;
			grid-template-rows: auto 500px auto auto 1fr;
			gap: 1rem;
		}
	}

	/* Mobile (<768px): Simplified layout */
	@media (max-width: 768px) {
		.main-layout {
			grid-template-areas:
				'header'
				'code'
				'info'
				'dag';
			grid-template-columns: 1fr;
			grid-template-rows: auto auto auto 1fr;
			gap: 0;
		}
		/* Events hidden in grid, shown in slide-up panel */
		/* DAG takes remaining space (1fr) */
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

	/* Mobile: Slide-up animation for events panel */
	@keyframes slideUp {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}

	:global(.animate-slide-up) {
		animation: slideUp 0.3s ease-out;
	}

	/* Pulsing dot indicator for clickable elements */
	:global(.pulse-dot) {
		position: fixed;
		width: 10px;
		height: 10px;
		background: rgba(255, 159, 28, 1);
		border: 2px solid rgba(255, 255, 255, 0.9);
		border-radius: 50%;
		transform: translate(-50%, -50%);
		pointer-events: none;
		z-index: 9999;
		animation: pulse-dot 1s ease-out 3;
		box-shadow: 0 0 8px rgba(255, 159, 28, 0.8);
	}

	@keyframes pulse-dot {
		0% {
			box-shadow: 0 0 8px rgba(255, 159, 28, 0.8), 0 0 0 0 rgba(255, 159, 28, 0.7);
			opacity: 1;
		}
		50% {
			box-shadow: 0 0 12px rgba(255, 159, 28, 1), 0 0 0 16px rgba(255, 159, 28, 0);
			opacity: 0.9;
		}
		100% {
			box-shadow: 0 0 8px rgba(255, 159, 28, 0.8), 0 0 0 0 rgba(255, 159, 28, 0);
			opacity: 1;
		}
	}
</style>
