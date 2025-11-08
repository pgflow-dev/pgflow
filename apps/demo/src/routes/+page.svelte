<script lang="ts">
	import { onDestroy } from 'svelte';
	import { pgflow } from '$lib/supabase';
	import { createFlowState } from '$lib/stores/pgflow-state.svelte';
	import { pulseDots } from '$lib/stores/pulse-dots.svelte';
	import DAGVisualization from '$lib/components/DAGVisualization.svelte';
	import DebugPanel from '$lib/components/DebugPanel.svelte';
	import CodePanel from '$lib/components/CodePanel.svelte';
	import ExplanationPanel from '$lib/components/ExplanationPanel.svelte';
	import WelcomeModal from '$lib/components/WelcomeModal.svelte';
	import PulseDot from '$lib/components/PulseDot.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Play, CheckCircle2 } from '@lucide/svelte';
	import { codeToHtml } from 'shiki';
	import type ArticleFlow from '../../supabase/functions/article_flow_worker/article_flow';

	const flowState = createFlowState<typeof ArticleFlow>(pgflow, 'article_flow', [
		'fetchArticle',
		'summarize',
		'extractKeywords',
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
		// Simple trigger - all mounted PulseDot components will pulse
		setTimeout(() => {
			pulseDots.trigger();
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

		if (clickedStep === null) {
			// Explicit clear selection request
			selectedStep = null;
			showFlowExplanation = false;
			console.log('Main page: Cleared selection');
		} else if (clickedStep === 'flow_config') {
			// Clicking flow config: select it and show flow explanation
			if (selectedStep === 'flow_config') {
				// Toggle off
				selectedStep = null;
				showFlowExplanation = false;
			} else {
				selectedStep = 'flow_config';
				showFlowExplanation = true;
				// Close events panel when opening explanation
				mobileEventsVisible = false;
				mobileEventsContentVisible = false;
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
			// Close events panel when opening explanation
			mobileEventsVisible = false;
			mobileEventsContentVisible = false;
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
	let mobileEventsContentVisible = $state(false); // Delayed for animation
	let eventsScrollContainer: HTMLDivElement | undefined;
	let expandedEventIdx = $state<number | null>(null);
	let highlightedEventJson = $state<Record<number, string>>({});

	function toggleMobileEvents() {
		if (!mobileEventsVisible) {
			// Opening: show expanded content, then start height animation
			mobileEventsContentVisible = true;
			mobileEventsVisible = true;
			// Close explanation panel when opening events
			selectedStep = null;
			showFlowExplanation = false;
		} else {
			// Closing: start height animation, hide expanded content after animation finishes
			mobileEventsVisible = false;
			setTimeout(() => {
				mobileEventsContentVisible = false;
			}, 300); // Match animation duration
			// Reset expanded event when closing panel
			expandedEventIdx = null;
		}
	}

	async function toggleEventExpanded(idx: number, event: unknown) {
		if (expandedEventIdx === idx) {
			expandedEventIdx = null;
		} else {
			// Generate syntax-highlighted JSON if not already cached
			if (!highlightedEventJson[idx]) {
				const truncated = truncateDeep(event);
				const jsonString = JSON.stringify(truncated, null, 2);
				const html = await codeToHtml(jsonString, {
					lang: 'json',
					theme: 'night-owl'
				});
				highlightedEventJson = { ...highlightedEventJson, [idx]: html };
			}
			// Set expanded after HTML is ready
			expandedEventIdx = idx;
		}
	}

	// Truncate deep function (same as ExplanationPanel)
	function truncateDeep(obj: unknown, maxLength = 80): unknown {
		if (typeof obj === 'string') {
			if (obj.length > maxLength) {
				return `<long string: ${obj.length} chars>`;
			}
			return obj;
		}
		if (Array.isArray(obj)) {
			return obj.map((item) => truncateDeep(item, maxLength));
		}
		if (obj !== null && typeof obj === 'object') {
			const truncated: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(obj)) {
				truncated[key] = truncateDeep(value, maxLength);
			}
			return truncated;
		}
		return obj;
	}

	// Auto-scroll events to right when new event arrives
	$effect(() => {
		if (flowState.timeline.length > 0 && eventsScrollContainer) {
			eventsScrollContainer.scrollTo({
				left: eventsScrollContainer.scrollWidth,
				behavior: 'smooth'
			});
		}
	});

	// Helper to get short step name
	function getShortStepName(stepSlug: string): string {
		const shortNames: Record<string, string> = {
			fetchArticle: 'fetch',
			summarize: 'summ',
			extractKeywords: 'kwrds',
			publish: 'pub'
		};
		return shortNames[stepSlug] || stepSlug.slice(0, 5);
	}

	// Helper to get event badge info
	function getEventBadgeInfo(event: {
		event_type: string;
		step_slug?: string;
	}): {
		icon: typeof Play | typeof CheckCircle2;
		color: string;
		text: string;
	} | null {
		if (event.event_type === 'step:started' && event.step_slug) {
			return {
				icon: Play,
				color: 'blue',
				text: getShortStepName(event.step_slug)
			};
		}
		if (event.event_type === 'step:completed' && event.step_slug) {
			return {
				icon: CheckCircle2,
				color: 'green',
				text: getShortStepName(event.step_slug)
			};
		}
		return null;
	}

	// Get displayable events (started/completed steps only)
	const displayableEvents = $derived(
		flowState.timeline
			.map((e, idx) => ({ event: e, badge: getEventBadgeInfo(e), idx }))
			.filter((e) => e.badge !== null)
	);


	// Fix for mobile viewport height (address bar issue)
	// Set actual viewport height as CSS custom property for browsers without dvh support
	function setViewportHeight() {
		// Use visualViewport if available (more accurate for mobile), otherwise window.innerHeight
		const vh = window.visualViewport?.height || window.innerHeight;
		document.documentElement.style.setProperty('--viewport-height', `${vh}px`);
	}

	// Set on mount and when viewport resizes (e.g., address bar show/hide)
	if (typeof window !== 'undefined') {
		setViewportHeight();

		// Listen to visualViewport resize if available (better for mobile)
		if (window.visualViewport) {
			window.visualViewport.addEventListener('resize', setViewportHeight);
		} else {
			// Fallback to window resize
			window.addEventListener('resize', setViewportHeight);
		}

		// Clean up on destroy
		onDestroy(() => {
			if (window.visualViewport) {
				window.visualViewport.removeEventListener('resize', setViewportHeight);
			} else {
				window.removeEventListener('resize', setViewportHeight);
			}
		});
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
				<div class="flex items-center gap-2 md:gap-3">
					<a href="https://pgflow.dev" class="flex items-center gap-1.5 md:gap-2">
						<img src="/pgflow-logo-dark.svg" alt="pgflow" class="h-5 md:h-8" />
						<span class="text-xs md:text-sm font-semibold">pgflow</span>
					</a>
					<span class="text-muted-foreground text-xs">|</span>
					<a href="https://pgflow.dev" class="text-xs text-muted-foreground hover:text-foreground"
						>Website</a
					>
					<span class="text-muted-foreground text-xs">|</span>
					<a
						href="https://github.com/pgflow-dev/pgflow"
						class="text-xs text-muted-foreground hover:text-foreground">GitHub</a
					>
				</div>

				<div class="flex-1"></div>

				<!-- Desktop: URL input + buttons -->
				<div class="hidden md:flex gap-2 flex-1 max-w-md ml-auto">
					<Input type="url" bind:value={url} placeholder="Enter article URL" class="flex-1" />
					<Button
						onclick={processArticle}
						disabled={isRunning}
						class={highlightButton
							? 'button-pulse cursor-pointer relative'
							: 'cursor-pointer relative'}
					>
						<PulseDot />
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

				<!-- Mobile: Process button only (events now in sticky bottom bar) -->
				<Button
					size="sm"
					onclick={processArticle}
					disabled={isRunning}
					class="md:hidden h-8 px-3 text-xs relative {highlightButton ? 'button-pulse' : ''}"
				>
					<PulseDot />
					Start
				</Button>
			</div>

			<!-- Code Panel -->
			<div class="overflow-hidden min-h-0" style="grid-area: code">
				<CodePanel
					{flowState}
					selectedStep={explanationVisible ? null : selectedStep}
					{hoveredStep}
					on:step-selected={handleStepSelected}
					on:step-hovered={handleStepHovered}
				/>
			</div>

			<!-- Mobile: Code-to-DAG connector - REMOVED to save vertical space -->
			<!-- Info is now in onboarding modal and explanation panels -->

			<!-- Event Stream (collapsible) -->
			{#if flowState.events.length > 0}
				<div class="overflow-hidden max-h-[35vh] md:block hidden" style="grid-area: events">
					<Card class={eventStreamCollapsed ? 'h-12' : 'h-full flex flex-col'}>
						<CardHeader
							class="pb-0 pt-3 flex-shrink-0 cursor-pointer hover:bg-accent/50 transition-colors relative"
							onclick={toggleEventStream}
						>
							<PulseDot />
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
				<!-- Mobile: Always show DAG (with bottom padding for events bar) -->
				<div class="md:hidden h-full flex flex-col pb-12">
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
					<CardContent class="p-2 h-full">
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
<div
	class="fixed inset-x-0 top-11 bottom-0 bg-card z-50 md:hidden flex flex-col overflow-hidden mobile-explanation-panel"
	class:mobile-visible={explanationVisible}
	onclick={(e) => {
		// Only close if clicking the panel itself, not content inside
		if (e.target === e.currentTarget) closeExplanation();
	}}
>
	<!-- Code snippet for selected step or flow config (sticky) with close button -->
	{#if selectedStep}
		<div class="bg-[#0d1117] text-xs overflow-x-auto flex-shrink-0 relative">
			<CodePanel
				{flowState}
				{selectedStep}
				hoveredStep={null}
				on:step-selected={handleStepSelected}
				on:step-hovered={() => {}}
			/>
			<!-- Close button overlay on code -->
			<button
				onclick={closeExplanation}
				class="absolute top-2 right-2 text-muted-foreground hover:text-foreground text-xl leading-none bg-[#0d1117]/80 rounded px-1.5 py-0.5 backdrop-blur-sm z-10"
				>✕</button
			>
		</div>
	{/if}

	<!-- Explanation content (scrollable, no card wrapper, no mobile header) -->
	<div class="overflow-auto flex-1">
		<ExplanationPanel
			{selectedStep}
			{flowState}
			visible={true}
			showMobileHeader={false}
			on:close={closeExplanation}
			on:step-selected={handleStepSelected}
			on:step-hovered={handleStepHovered}
		/>
	</div>
</div>

<!-- Mobile: Sticky bottom events bar -->
{#if flowState.timeline.length > 0}
	<!-- Backdrop for expanded state -->
	<div
		class="fixed inset-0 bg-black/50 z-40 md:hidden mobile-events-backdrop"
		class:mobile-visible={mobileEventsVisible}
		onclick={toggleMobileEvents}
	></div>

	<!-- Events bar container - transitions between collapsed and expanded -->
	<div
		class="fixed inset-x-0 bottom-0 z-50 md:hidden border-t border-border mobile-events-bar-container"
		class:expanded={mobileEventsVisible}
	>
		<!-- Collapsed view: Horizontal event badges (whole bar is clickable) -->
		<button
			onclick={toggleMobileEvents}
			class="flex items-center gap-2 px-3 py-2 h-12 w-full bg-card hover:bg-accent/30 transition-colors cursor-pointer"
			style="display: {mobileEventsContentVisible ? 'none' : 'flex'}"
		>
			<div class="text-xs text-muted-foreground flex items-center gap-1 flex-shrink-0">
				<span class="font-semibold">Events</span>
				<span>({displayableEvents.length})</span>
				<span class="text-[10px]">▲</span>
			</div>
			<div
				class="flex-1 overflow-x-auto flex gap-1.5 event-badges-scroll pointer-events-none"
				bind:this={eventsScrollContainer}
			>
				{#each displayableEvents as { badge, idx } (idx)}
					{#if badge}
						<div
							class="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium flex-shrink-0 event-badge event-badge-{badge.color}"
						>
							<svelte:component this={badge.icon} class="w-3 h-3" />
							<span>{badge.text}</span>
						</div>
					{/if}
				{/each}
			</div>
		</button>

		<!-- Expanded view: Full event list with badges -->
		<div
			class="h-full flex flex-col bg-[#252928]"
			style="display: {mobileEventsContentVisible ? 'flex' : 'none'}"
		>
			<div
				class="flex items-center justify-between px-3 py-2.5 border-b border-border/50 flex-shrink-0"
			>
				<h3 class="font-semibold text-sm">Event Stream ({displayableEvents.length})</h3>
				<button onclick={toggleMobileEvents} class="text-muted-foreground text-lg">✕</button>
			</div>
			<div class="overflow-auto flex-1 py-2">
				<div class="space-y-1.5 px-3">
					{#each displayableEvents as { badge, event, idx }, i (idx)}
						{#if badge}
							<button
								onclick={() => toggleEventExpanded(idx, event)}
								class="w-full text-left rounded event-badge-row event-badge-{badge.color} cursor-pointer hover:opacity-80 transition-opacity"
							>
								<div class="flex items-center gap-2 px-3 py-2">
									<svelte:component this={badge.icon} class="w-4 h-4 flex-shrink-0" />
									<div class="flex-1 min-w-0">
										<div class="font-medium text-sm">{event.step_slug || 'Unknown'}</div>
										<div class="text-xs opacity-70">
											{event.event_type.replace('step:', '')}
										</div>
									</div>
									<div class="flex items-center gap-2 flex-shrink-0">
										<div class="text-xs opacity-70 font-mono text-muted-foreground">
											{event.deltaDisplay}
										</div>
										<div class="text-xs opacity-50">
											{expandedEventIdx === idx ? '▼' : '▶'}
										</div>
									</div>
								</div>

								{#if expandedEventIdx === idx && highlightedEventJson[idx]}
									<div class="px-3 pb-2" onclick={(e) => e.stopPropagation()}>
										<div class="event-json-display rounded overflow-x-auto">
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											{@html highlightedEventJson[idx]}
										</div>
									</div>
								{/if}
							</button>
						{/if}
					{/each}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.page-container {
		/* Mobile viewport height fix - cascade from least to most supported */
		/* 1. Fallback for very old browsers */
		height: 100vh;
		max-height: 100vh;
		/* 2. JS-calculated actual viewport (for browsers without dvh) */
		height: var(--viewport-height, 100vh);
		max-height: var(--viewport-height, 100vh);
		/* 3. Modern dynamic viewport height (accounts for mobile UI automatically) */
		height: 100dvh;
		max-height: 100dvh;

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
				'dag';
			grid-template-columns: 1fr;
			grid-template-rows: auto auto 1fr;
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

	/* Mobile explanation panel - slides up from below viewport */
	@media (max-width: 768px) {
		.mobile-explanation-panel {
			transform: translateY(100%);
			transition: transform 400ms cubic-bezier(0.4, 0, 0.2, 1);
			will-change: transform;
		}

		.mobile-explanation-panel.mobile-visible {
			transform: translateY(0);
		}

		/* Mobile events panel - slides up from below viewport */
		.mobile-events-panel {
			transform: translateY(100%);
			transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1);
			will-change: transform;
		}

		.mobile-events-panel.mobile-visible {
			transform: translateY(0);
		}

		/* Mobile events backdrop - fades in/out */
		.mobile-events-backdrop {
			opacity: 0;
			transition: opacity 300ms ease;
			pointer-events: none;
		}

		.mobile-events-backdrop.mobile-visible {
			opacity: 1;
			pointer-events: auto;
		}

		/* Mobile events sticky bar container */
		.mobile-events-bar-container {
			height: 48px; /* Collapsed height */
			transition: height 300ms cubic-bezier(0.4, 0, 0.2, 1);
			box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
			overflow: hidden;
		}

		.mobile-events-bar-container.expanded {
			height: 70vh; /* Expanded height */
		}

		/* Event badges scroll container */
		.event-badges-scroll {
			scrollbar-width: none; /* Firefox */
			-ms-overflow-style: none; /* IE/Edge */
		}

		.event-badges-scroll::-webkit-scrollbar {
			display: none; /* Chrome/Safari */
		}

		/* Event badge colors (for collapsed bar) */
		.event-badge-blue {
			background-color: rgba(59, 91, 219, 0.15);
			border: 1px solid rgba(91, 141, 239, 0.4);
			color: #5b8def;
		}

		.event-badge-green {
			background-color: rgba(23, 122, 81, 0.15);
			border: 1px solid rgba(32, 165, 111, 0.4);
			color: #20a56f;
		}

		/* Event badge rows (for expanded view) */
		.event-badge-row {
			border: 1px solid transparent;
		}

		.event-badge-row.event-badge-blue {
			background-color: rgba(59, 91, 219, 0.2);
			border-color: rgba(91, 141, 239, 0.5);
			color: #7ba3f0;
		}

		.event-badge-row.event-badge-green {
			background-color: rgba(23, 122, 81, 0.2);
			border-color: rgba(32, 165, 111, 0.5);
			color: #2ec184;
		}

		/* Event JSON display */
		.event-json-display {
			max-height: 300px;
		}

		.event-json-display :global(pre) {
			margin: 0 !important;
			padding: 8px 10px !important;
			background: #0d1117 !important;
			border-radius: 4px;
			font-size: 10px;
			line-height: 1.5;
			display: table;
			min-width: 100%;
		}

		.event-json-display :global(code) {
			font-family: 'Fira Code', 'Monaco', 'Menlo', 'Courier New', monospace;
			white-space: pre;
			display: block;
		}
	}
</style>
