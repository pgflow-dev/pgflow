<script lang="ts">
	import { onDestroy } from 'svelte';
	import { pgflow } from '$lib/supabase';
	import { createFlowState } from '$lib/stores/pgflow-state.svelte';
	import { pulseDots } from '$lib/stores/pulse-dots.svelte';
	import DAGVisualization from '$lib/components/DAGVisualization.svelte';
	import EventsPanel from '$lib/components/EventsPanel.svelte';
	import CodePanel from '$lib/components/CodePanel.svelte';
	import ExplanationPanel from '$lib/components/ExplanationPanel.svelte';
	import WelcomeModal from '$lib/components/WelcomeModal.svelte';
	import PulseDot from '$lib/components/PulseDot.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Card } from '$lib/components/ui/card';
	import {
		Play,
		CheckCircle2,
		XCircle,
		Code,
		GitBranch,
		Radio,
		Loader2,
		Lightbulb
	} from '@lucide/svelte';
	import { codeToHtml } from 'shiki';
	import type ArticleFlow from '../../supabase/functions/article_flow_worker/article_flow';
	import { track } from '$lib/analytics';

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

	// Analytics tracking state
	let flowStartTime: number | undefined;
	let explanationOpenTime: number | undefined;
	let eventsOpenTime: number | undefined;

	// Show explanation panel when either a step is selected OR flow explanation is requested
	const explanationVisible = $derived(selectedStep !== null || showFlowExplanation);

	// Debug effect to track when selectedStep changes
	$effect(() => {
		console.log('[DEBUG] selectedStep changed to:', selectedStep);
		console.trace('[DEBUG] Stack trace for selectedStep change');
	});

	async function processArticle() {
		console.log('[DEBUG] processArticle called, selectedStep before:', selectedStep);

		// Track Flow Started
		track('Flow Started', {
			is_first_run: !hasRunOnce,
			source: showWelcome ? 'welcome_modal' : 'header_button',
			url_length: url.length
		});

		flowStartTime = Date.now();

		try {
			const run = await flowState.startFlow({ url });
			console.log('Flow started:', run);
			console.log('Step states:', run?.stepStates);
			console.log('[DEBUG] processArticle finished, selectedStep after:', selectedStep);
		} catch (error) {
			console.error('Failed to start flow:', error);

			// Track Flow Failed
			track('Flow Failed', {
				error_message: error instanceof Error ? error.message : String(error)
			});
		}
	}

	// Track when first run completes (no longer shows modal on completion)
	$effect(() => {
		if (!hasRunOnce && flowState.status === 'completed') {
			// Mark first run as complete (used for UI state tracking)
			hasRunOnce = true;
			// Don't show modal on completion - it breaks the flow of viewing results

			// Show pulse dots to guide user to explore the completed flow
			showPulseDots();

			// Track Flow Completed
			if (flowStartTime) {
				const duration = Math.round((Date.now() - flowStartTime) / 1000);
				track('Flow Completed', {
					duration_seconds: duration,
					total_steps: 4
				});
			}
		}
	});

	// Auto-open explanation panel when a step fails
	$effect(() => {
		// Track status changes for all known steps
		const stepSlugs = ['fetchArticle', 'summarize', 'extractKeywords', 'publish'];

		// Check each step's status using reactive getters
		const failedSteps = stepSlugs.filter((slug) => {
			const status = flowState.step(slug).status;
			return status === 'failed';
		});

		// If we have a failed step, immediately select it
		if (failedSteps.length > 0) {
			const firstFailedSlug = failedSteps[0];

			if (firstFailedSlug && selectedStep !== firstFailedSlug) {
				const previousSelection = selectedStep;
				selectedStep = firstFailedSlug;
				showFlowExplanation = false;
				// Close mobile events panel if open (so explanation panel shows)
				mobileEventsVisible = false;
				mobileEventsContentVisible = false;

				// Track Failed Step Auto Selected
				track('Failed Step Auto Selected', {
					step_slug: firstFailedSlug,
					previous_selection: previousSelection || 'none'
				});
			}
		}
	});

	function handleRunFromModal() {
		// Track Run Demo
		track('Run Demo', {
			source: 'welcome_modal',
			is_first_run: !hasRunOnce
		});

		// Close modal and run
		showWelcome = false;
		setTimeout(() => {
			processArticle();
		}, 300);
	}

	function showPulseDots() {
		// Simple trigger - all mounted PulseDot components will pulse
		setTimeout(() => {
			pulseDots.trigger();
		}, 300);
	}

	function handleDismissModal() {
		// Track Explore Code First
		track('Explore Code First', {
			dismissed_without_running: !hasRunOnce
		});

		showWelcome = false;
		// Show pulsing dots on all clickable elements after any modal dismiss
		showPulseDots();
	}

	function handleStepSelected(event: CustomEvent<{ stepSlug: string | null; source?: string }>) {
		const clickedStep = event.detail.stepSlug;
		const source = event.detail.source || 'unknown';
		console.log('Main page: handleStepSelected called with:', clickedStep, 'source:', source);

		if (clickedStep === null) {
			// Explicit clear selection request
			const previousStep = selectedStep;
			selectedStep = null;
			showFlowExplanation = false;
			console.log('Main page: Cleared selection');

			// Track Step Deselected
			if (previousStep) {
				track('Step Deselected', {
					previous_step: previousStep,
					method: 'clear_explicit'
				});
			}
		} else if (clickedStep === 'flow_config') {
			// Clicking flow config: select it and show flow explanation
			if (selectedStep === 'flow_config') {
				// Toggle off
				selectedStep = null;
				showFlowExplanation = false;

				// Track Flow Config Deselected
				track('Step Deselected', {
					previous_step: 'flow_config',
					method: 'toggle'
				});
			} else {
				selectedStep = 'flow_config';
				showFlowExplanation = true;
				// Close events panel when opening explanation
				mobileEventsVisible = false;
				mobileEventsContentVisible = false;

				// Track Flow Config Selected
				track('Flow Config Selected', {
					source: 'code'
				});
			}
			console.log('Main page: Flow config toggled, showFlowExplanation:', showFlowExplanation);
		} else if (selectedStep === clickedStep) {
			// Toggle behavior: if clicking the same step, deselect it
			selectedStep = null;
			showFlowExplanation = false;
			console.log('Main page: Toggled off - deselected step');

			// Track Step Deselected
			track('Step Deselected', {
				previous_step: clickedStep,
				method: 'toggle'
			});
		} else {
			// Select a different step
			const previousStep = selectedStep;
			const stepSlugs = ['fetchArticle', 'summarize', 'extractKeywords', 'publish'];
			const stepIndex = stepSlugs.indexOf(clickedStep);

			selectedStep = clickedStep;
			showFlowExplanation = false;
			// Close events panel when opening explanation
			mobileEventsVisible = false;
			mobileEventsContentVisible = false;
			console.log('Main page: Selected step:', selectedStep);

			// Track Step Selected
			track('Step Selected', {
				step_slug: clickedStep,
				step_status: flowState.step(clickedStep).status || 'unknown',
				source,
				step_position: stepIndex,
				previous_step: previousStep || 'none'
			});
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
		const previousStep = selectedStep;
		selectedStep = null;
		showFlowExplanation = false;

		// Track Explanation Closed
		if (previousStep || showFlowExplanation) {
			const isMobileDevice = typeof window !== 'undefined' && window.innerWidth < 768;
			track('Explanation Closed', {
				step_slug: previousStep || 'flow_config',
				device: isMobileDevice ? 'mobile' : 'desktop',
				time_open_seconds: explanationOpenTime
					? Math.round((Date.now() - explanationOpenTime) / 1000)
					: 0
			});
		}
	}

	function clearSelection() {
		const previousStep = selectedStep;
		selectedStep = null;
		showFlowExplanation = false;

		// Track Clear Selection Clicked
		if (previousStep) {
			track('Clear Selection Clicked', {
				previous_step: previousStep,
				device: 'desktop'
			});
		}
	}

	// Track explanation panel opening
	$effect(() => {
		if (explanationVisible) {
			explanationOpenTime = Date.now();
			const isMobileDevice = typeof window !== 'undefined' && window.innerWidth < 768;

			// Determine trigger
			let trigger: string;
			if (showFlowExplanation) {
				trigger = 'flow_config';
			} else {
				// Check if this was auto-selected due to failure
				const stepSlugs = ['fetchArticle', 'summarize', 'extractKeywords', 'publish'];
				const failedSteps = stepSlugs.filter((slug) => flowState.step(slug).status === 'failed');
				trigger = failedSteps.includes(selectedStep || '') ? 'auto_failed_step' : 'step_selected';
			}

			track('Explanation Opened', {
				trigger,
				step_slug: selectedStep || 'flow_config',
				device: isMobileDevice ? 'mobile' : 'desktop'
			});
		}
	});

	// Automatic cleanup on unmount
	onDestroy(() => flowState.dispose());

	const isRunning = $derived(flowState.status === 'starting' || flowState.status === 'started');

	// Mobile events panel state
	let mobileEventsVisible = $state(false);
	let mobileEventsContentVisible = $state(false); // Delayed for animation
	let eventsScrollContainer: HTMLDivElement | undefined;
	let expandedEventIdx = $state<number | null>(null);
	let highlightedEventJson = $state<Record<number, string>>({});
	let isMobile = $state(false);

	function toggleMobileEvents() {
		if (!mobileEventsVisible) {
			// Opening: show expanded content, then start height animation
			mobileEventsContentVisible = true;
			mobileEventsVisible = true;
			eventsOpenTime = Date.now();
			// Close explanation panel when opening events
			selectedStep = null;
			showFlowExplanation = false;

			// Track Events Panel Opened
			const stepSlugs = ['fetchArticle', 'summarize', 'extractKeywords', 'publish'];
			const failedSteps = stepSlugs.filter((slug) => flowState.step(slug).status === 'failed');
			track('Events Panel Opened', {
				event_count: displayableEvents.length,
				has_failed_events: failedSteps.length > 0
			});
		} else {
			// Closing: start height animation, hide expanded content after animation finishes
			mobileEventsVisible = false;
			setTimeout(() => {
				mobileEventsContentVisible = false;
			}, 300); // Match animation duration
			// Reset expanded event when closing panel
			expandedEventIdx = null;

			// Track Events Panel Closed
			if (eventsOpenTime) {
				track('Events Panel Closed', {
					time_open_seconds: Math.round((Date.now() - eventsOpenTime) / 1000),
					events_expanded: expandedEventIdx !== null
				});
			}
		}
	}

	async function toggleEventExpanded(idx: number, event: unknown) {
		if (expandedEventIdx === idx) {
			expandedEventIdx = null;

			// Track Event Collapsed
			const eventData = event as { event_type?: string; step_slug?: string };
			track('Event Collapsed', {
				event_type: eventData.event_type || 'unknown',
				step_slug: eventData.step_slug || 'unknown',
				device: isMobile ? 'mobile' : 'desktop'
			});
		} else {
			// Generate syntax-highlighted JSON if not already cached
			if (!highlightedEventJson[idx]) {
				// Mobile: 50 chars, Desktop: 500 chars
				const maxLength = isMobile ? 50 : 500;
				const truncated = truncateDeep(event, maxLength);
				const jsonString = JSON.stringify(truncated, null, 2);
				const html = await codeToHtml(jsonString, {
					lang: 'json',
					theme: 'night-owl'
				});
				highlightedEventJson = { ...highlightedEventJson, [idx]: html };
			}
			// Set expanded after HTML is ready
			expandedEventIdx = idx;

			// Track Event Expanded
			const eventData = event as { event_type?: string; step_slug?: string };
			track('Event Expanded', {
				event_type: eventData.event_type || 'unknown',
				step_slug: eventData.step_slug || 'unknown',
				event_position: idx,
				device: isMobile ? 'mobile' : 'desktop'
			});
		}
	}

	// Auto-expand failed events (both desktop and mobile)
	$effect(() => {
		// Find the most recent failed event
		const failedEvents = displayableEvents.filter((e) => e.event.event_type === 'step:failed');
		if (failedEvents.length > 0) {
			const mostRecentFailed = failedEvents[failedEvents.length - 1];

			// Auto-expand the failed event
			if (expandedEventIdx !== mostRecentFailed.idx) {
				toggleEventExpanded(mostRecentFailed.idx, mostRecentFailed.event);
			}

			// Note: Don't auto-open mobile events panel here - the ExplanationPanel
			// will auto-open instead (they conflict on mobile)
		}
	});

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
	function getEventBadgeInfo(event: { event_type: string; step_slug?: string }): {
		icon: typeof Play | typeof CheckCircle2 | typeof XCircle;
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
		if (event.event_type === 'step:failed' && event.step_slug) {
			return {
				icon: XCircle,
				color: 'red',
				text: getShortStepName(event.step_slug)
			};
		}
		return null;
	}

	// Get displayable events (started/completed/failed steps only)
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

		// Detect mobile viewport for truncation
		const mediaQuery = window.matchMedia('(max-width: 767px)');
		isMobile = mediaQuery.matches;

		const updateMobile = (e: MediaQueryListEvent) => {
			isMobile = e.matches;
			// Clear cache when switching to force regeneration with new truncation
			highlightedEventJson = {};
		};

		mediaQuery.addEventListener('change', updateMobile);

		// Listen to visualViewport resize if available (better for mobile)
		if (window.visualViewport) {
			window.visualViewport.addEventListener('resize', setViewportHeight);
		} else {
			// Fallback to window resize
			window.addEventListener('resize', setViewportHeight);
		}

		// Clean up on destroy
		onDestroy(() => {
			mediaQuery.removeEventListener('change', updateMobile);
			if (window.visualViewport) {
				window.visualViewport.removeEventListener('resize', setViewportHeight);
			} else {
				window.removeEventListener('resize', setViewportHeight);
			}
		});
	}
</script>

<WelcomeModal visible={showWelcome} onRunFlow={handleRunFromModal} onDismiss={handleDismissModal} />

<div class="page-container">
	<div class="page-content">
		<!-- Main Grid Layout -->
		<div class="grid gap-0 min-h-0 flex-1 main-layout">
			<!-- Header: Sticky across all breakpoints -->
			<div
				class="sticky top-0 z-50 bg-background border-b border-border flex items-center gap-2 md:gap-4 px-3 h-10"
				style="grid-area: header"
			>
				<!-- Logo + branding -->
				<div class="flex items-center gap-2 md:gap-3">
					<a
						href="https://pgflow.dev"
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center gap-1.5 md:gap-2"
						onclick={() => track('Logo Clicked', { location: 'header' })}
					>
						<img src="/pgflow-logo-dark.svg" alt="pgflow" class="h-5 md:h-6" />
						<span class="text-xs md:text-sm font-semibold">pgflow</span>
					</a>
					<span class="text-muted-foreground text-xs">|</span>
					<a
						href="https://pgflow.dev"
						target="_blank"
						rel="noopener noreferrer"
						class="text-xs text-muted-foreground hover:text-foreground"
						onclick={() =>
							track('External Link Clicked', { destination: 'website', location: 'header' })}
						>Website</a
					>
					<span class="text-muted-foreground text-xs">|</span>
					<a
						href="https://github.com/pgflow-dev/pgflow"
						target="_blank"
						rel="noopener noreferrer"
						class="text-xs text-muted-foreground hover:text-foreground"
						onclick={() =>
							track('External Link Clicked', { destination: 'github', location: 'header' })}
						>GitHub</a
					>
				</div>

				<!-- Center: Clear Selection button -->
				{#if explanationVisible}
					<div class="flex-1 flex items-center justify-center">
						<Button
							variant="outline"
							size="sm"
							onclick={clearSelection}
							class="cursor-pointer hidden md:flex h-7 text-xs"
						>
							✕ Clear Selection
						</Button>
					</div>
				{:else}
					<div class="flex-1"></div>
				{/if}

				<!-- Desktop: URL input + buttons -->
				<div class="hidden md:flex items-center gap-2 flex-1">
					<Input type="url" bind:value={url} placeholder="Enter article URL" class="flex-1" />
					<Button
						onclick={processArticle}
						disabled={isRunning}
						class={highlightButton
							? 'button-pulse cursor-pointer relative'
							: 'cursor-pointer relative'}
					>
						<PulseDot />
						{#if isRunning}
							<Loader2 class="w-4 h-4 mr-2 animate-spin" />
						{:else}
							<Play class="w-4 h-4 mr-2" />
						{/if}
						{hasRunOnce ? 'Restart' : 'Process Article'}
					</Button>
				</div>

				<!-- Mobile: Process button only (events now in sticky bottom bar) -->
				<Button
					size="sm"
					onclick={processArticle}
					disabled={isRunning}
					class="md:hidden h-8 px-3 text-xs relative {highlightButton ? 'button-pulse' : ''}"
				>
					<PulseDot />
					{#if isRunning}
						<Loader2 class="w-3 h-3 mr-1 animate-spin" />
					{:else}
						<Play class="w-3 h-3 mr-1" />
					{/if}
					{hasRunOnce ? 'Restart' : 'Start'}
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

			<!-- Mobile: DAG only (explanation is overlay) -->
			<div class="md:hidden overflow-hidden h-full pb-12" style="grid-area: dag">
				<DAGVisualization
					{flowState}
					{selectedStep}
					{hoveredStep}
					on:step-selected={handleStepSelected}
					on:step-hovered={handleStepHovered}
				/>
			</div>

			<!-- Desktop: Right Column (DAG + Events stacked) -->
			<div class="hidden md:flex flex-col gap-4 overflow-hidden" style="grid-area: right-column">
				<!-- DAG -->
				<Card class="flex p-0 flex-shrink-0 overflow-hidden" style="height: 240px;">
					<div class="flex-1 dag-zoom-container">
						<DAGVisualization
							{flowState}
							{selectedStep}
							{hoveredStep}
							on:step-selected={handleStepSelected}
							on:step-hovered={handleStepHovered}
						/>
					</div>
				</Card>

				<!-- Events (grows to fill space) -->
				<div class="flex-1 min-h-0 overflow-hidden">
					<EventsPanel {flowState} />
				</div>
			</div>

			<!-- Desktop: Explanation Panel (below code) -->
			{#if explanationVisible}
				<div
					class="overflow-auto min-h-0 hidden md:block bg-card rounded-lg border border-border p-0"
					style="grid-area: explanation"
				>
					<ExplanationPanel
						{selectedStep}
						{flowState}
						visible={true}
						on:close={closeExplanation}
						on:step-selected={handleStepSelected}
						on:step-hovered={handleStepHovered}
					/>
				</div>
			{:else}
				<!-- Placeholder cheat sheet -->
				<div
					class="overflow-auto min-h-0 hidden md:flex flex-col items-center justify-center bg-card rounded-lg border border-border p-4 gap-4"
					style="grid-area: explanation"
				>
					<!-- Interaction icons (smaller, moved up) -->
					<div class="grid grid-cols-3 gap-4 max-w-2xl">
						<!-- Code interaction -->
						<div class="flex flex-col items-center text-center gap-2">
							<div class="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
								<Code class="w-6 h-6 text-blue-400" />
							</div>
							<div>
								<h3 class="font-semibold text-xs mb-0.5">Click Code</h3>
								<p class="text-xs text-muted-foreground">Select a step to see details</p>
							</div>
						</div>

						<!-- DAG interaction -->
						<div class="flex flex-col items-center text-center gap-2">
							<div class="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
								<GitBranch class="w-6 h-6 text-green-400" />
							</div>
							<div>
								<h3 class="font-semibold text-xs mb-0.5">Explore DAG</h3>
								<p class="text-xs text-muted-foreground">Click nodes to see dependencies</p>
							</div>
						</div>

						<!-- Watch execution -->
						<div class="flex flex-col items-center text-center gap-2">
							<div class="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
								<Radio class="w-6 h-6 text-purple-400" />
							</div>
							<div>
								<h3 class="font-semibold text-xs mb-0.5">Watch Events</h3>
								<p class="text-xs text-muted-foreground">Track execution in real-time</p>
							</div>
						</div>
					</div>

					<!-- Key Architecture Insight Box (moved down) -->
					<div class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 max-w-2xl">
						<h3 class="font-bold text-base text-foreground mb-2 flex items-center gap-2">
							<Lightbulb class="w-5 h-5 text-blue-400" />
							How pgflow Works
						</h3>
						<p class="text-sm text-foreground/90 leading-relaxed">
							<strong>Postgres is the source of truth.</strong> It exposes a SQL API to manage state.
							Client starts flows → API queues tasks → Workers poll and execute → API propagates state
							through the DAG. Simple and modular.
						</p>
					</div>
				</div>
			{/if}
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
		class="flex items-center gap-2 px-3 py-2 h-12 w-full bg-card hover:bg-accent/30 transition-colors cursor-pointer relative"
		style="display: {mobileEventsContentVisible ? 'none' : 'flex'}"
	>
		<div class="text-xs text-muted-foreground flex items-center gap-1 flex-shrink-0">
			<span class="font-semibold">Events</span>
			<span>({displayableEvents.length})</span>
			<span class="text-[10px]">▲</span>
			<!-- PulseDot for mobile events footer -->
			<div class="ml-1">
				<PulseDot />
			</div>
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
				{#if displayableEvents.length === 0}
					<p class="text-sm text-muted-foreground text-center py-8">
						No events yet. Start a flow to see events.
					</p>
				{:else}
					{#each displayableEvents as { badge, event, idx } (idx)}
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
				{/if}
			</div>
		</div>
	</div>
</div>

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
	@media (max-width: 767px) {
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

	/* CSS Grid Layout: Desktop (>=768px) - 2 columns */
	.main-layout {
		grid-template-areas:
			'header       header'
			'code         right-column'
			'explanation  right-column';
		grid-template-columns: 1fr 300px;
		grid-template-rows: auto auto 1fr;
		gap: 1rem;
	}

	/* Mobile (<=767px): Simplified layout */
	@media (max-width: 767px) {
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

	/* DAG zoom container - scale down for compact view */
	.dag-zoom-container {
		transform: scale(0.95);
		transform-origin: center center;
		display: flex;
		flex: 1;
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
	@media (max-width: 767px) {
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

		.event-badge-red {
			background-color: rgba(220, 38, 38, 0.15);
			border: 1px solid rgba(239, 68, 68, 0.4);
			color: #ef4444;
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

		.event-badge-row.event-badge-red {
			background-color: rgba(220, 38, 38, 0.2);
			border-color: rgba(239, 68, 68, 0.5);
			color: #f87171;
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
