<script lang="ts">
	import type { createFlowState } from '$lib/stores/pgflow-state-improved.svelte';
	import { codeToHtml } from 'shiki';
	import { SvelteMap } from 'svelte/reactivity';

	interface Props {
		flowState: ReturnType<typeof createFlowState>;
		selectedStep?: string | null;
		hoveredStep?: string | null;
	}

	let { flowState, selectedStep = null, hoveredStep = null }: Props = $props();

	let expandedEventIndices = $state<Set<number>>(new Set());
	let highlightedEvents: SvelteMap<number, string> = new SvelteMap();

	async function toggleEvent(index: number, event: MouseEvent) {
		// Stop propagation
		event.stopPropagation();

		const wasExpanded = expandedEventIndices.has(index);

		if (wasExpanded) {
			// Collapse this event
			expandedEventIndices = new Set();
		} else {
			// Expand this event, collapse all others
			expandedEventIndices = new Set([index]);

			// Generate highlighted HTML if not already cached
			if (!highlightedEvents.has(index)) {
				const eventData = flowState.events[index].data;
				const jsonString = JSON.stringify(eventData, null, 2);
				const html = await codeToHtml(jsonString, {
					lang: 'json',
					theme: 'night-owl'
				});
				highlightedEvents.set(index, html);
				// Trigger reactivity
				highlightedEvents = new SvelteMap(highlightedEvents);
			}
		}
	}

	// Clear cache when flow resets (events list becomes empty or significantly changes)
	let lastEventCount = $state(0);
	$effect(() => {
		const currentEventCount = flowState.events.length;
		// If events list was cleared or reduced significantly, clear the cache
		if (currentEventCount === 0 || currentEventCount < lastEventCount - 5) {
			highlightedEvents = new SvelteMap();
			expandedEventIndices = new Set();
		}
		lastEventCount = currentEventCount;
	});

	// Get relative time from flow start
	function formatRelativeTime(timestamp: Date, firstEventTimestamp: Date): string {
		const diffMs = timestamp.getTime() - firstEventTimestamp.getTime();
		const seconds = (diffMs / 1000).toFixed(3);
		return `+${seconds}s`;
	}

	// Get display status from event_type (use the status part for badge coloring)
	function getEventStatus(eventType: string): string {
		return eventType.split(':')[1] || 'unknown';
	}

	// Get full event name for display
	function getEventDisplayName(eventType: string): string {
		return eventType;
	}

	// Get color class for event name based on status
	function getEventColor(eventType: string): string {
		const status = getEventStatus(eventType);
		switch (status) {
			case 'started':
				return 'text-[#5b8def]'; // blue (running)
			case 'completed':
				return 'text-[#20a56f]'; // green
			case 'failed':
				return 'text-[#f08060]'; // red
			case 'created':
				return 'text-[#607b75]'; // gray
			default:
				return 'text-muted-foreground';
		}
	}
</script>

<div class="flex flex-col h-full min-w-0">
	{#if flowState.events.length > 0}
		<!-- Table-like headers -->
		<div
			class="flex items-center gap-2 px-3 py-1 border-b border-muted text-xs font-semibold text-muted-foreground"
		>
			<div class="w-[80px] text-left">TIME</div>
			<div class="w-[140px] text-left">EVENT</div>
			<div class="flex-1 text-left">STEP</div>
			<div class="w-[32px]"></div>
			<!-- Space for expand arrow -->
		</div>
	{/if}

	<div class="flex-1 overflow-y-auto overflow-x-hidden space-y-1 min-w-0">
		{#if flowState.events.length === 0}
			<p class="text-sm text-muted-foreground text-center py-8">
				No events yet. Start a flow to see events.
			</p>
		{:else}
			{@const firstEventTimestamp = flowState.events[0]?.timestamp}
			{#each flowState.events as event, index (index)}
				{@const eventType = event.event_type}
				{@const stepSlug = event.data?.step_slug}
				{@const eventDisplayName = getEventDisplayName(eventType)}
				{@const eventColor = getEventColor(eventType)}
				{@const isExpanded = expandedEventIndices.has(index)}
				{@const isHighlighted = stepSlug && hoveredStep === stepSlug}
				{@const isSelected = stepSlug && selectedStep === stepSlug}

				<div
					class="event-container border-l-2 border-muted pl-2 py-1 transition-all duration-200"
					style="min-width: 0; max-width: 100%;"
				>
					<button
						class="flex items-center gap-2 w-full text-left px-1 rounded transition-colors hover:bg-muted/20"
						onclick={(e) => toggleEvent(index, e)}
					>
						<code class="w-[80px] text-base text-muted-foreground font-mono text-left"
							>{formatRelativeTime(event.timestamp, firstEventTimestamp)}</code
						>
						<code class="w-[140px] text-base font-semibold font-mono {eventColor}">
							{eventDisplayName}
						</code>
						{#if stepSlug}
							<code
								class="flex-1 text-base font-bold px-2 py-0.5 rounded font-mono transition-colors {isHighlighted
									? 'bg-blue-400/20 text-blue-300'
									: isSelected
										? 'bg-blue-500/15 text-blue-400'
										: 'bg-muted text-foreground'}">{stepSlug}</code
							>
						{:else}
							<span class="flex-1 text-base font-medium text-muted-foreground">-</span>
						{/if}
						<span class="w-[32px] text-muted-foreground text-base text-left"
							>{isExpanded ? '▼' : '▶'}</span
						>
					</button>
					{#if isExpanded}
						{@const highlightedHtml = highlightedEvents.get(index)}
						{#if highlightedHtml}
							<div class="event-payload-box mt-1">
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html highlightedHtml}
							</div>
						{:else}
							<pre
								class="event-payload-fallback text-sm bg-background/50 p-2 rounded overflow-x-auto max-h-32 mt-1">{JSON.stringify(
									event.data,
									null,
									2
								)}</pre>
						{/if}
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	/* Event container */
	.event-container {
		border-radius: 4px;
		min-width: 0;
		width: 100%;
		overflow: hidden;
	}

	/* Event payload syntax highlighting box */
	.event-payload-box {
		border-radius: 4px;
		overflow-x: scroll;
		overflow-y: auto;
		max-width: 100%;
		width: 100%;
		min-width: 0;
		max-height: 8rem;
	}

	.event-payload-box :global(pre) {
		margin: 0 !important;
		padding: 8px 10px !important;
		background: #0d1117 !important;
		border-radius: 4px;
		font-size: 13px;
		line-height: 1.5;
		overflow: visible !important;
	}

	.event-payload-box :global(code) {
		font-family: 'Fira Code', 'Monaco', 'Menlo', 'Courier New', monospace;
		white-space: pre !important;
		word-wrap: normal !important;
		overflow-wrap: normal !important;
		display: block !important;
	}

	/* Fallback pre element */
	.event-payload-fallback {
		max-width: 100%;
		overflow-x: auto !important;
		white-space: pre;
		word-wrap: normal;
	}
</style>
