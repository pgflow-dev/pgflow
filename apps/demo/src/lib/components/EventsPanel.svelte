<script lang="ts">
	import type { createFlowState } from '$lib/stores/pgflow-state.svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Play, CheckCircle2, XCircle } from '@lucide/svelte';
	import { codeToHtml } from 'shiki';

	interface Props {
		flowState: ReturnType<typeof createFlowState>;
	}

	let { flowState }: Props = $props();

	let expandedEventIdx = $state<number | null>(null);
	let highlightedEventJson = $state<Record<number, string>>({});
	let isMobile = $state(false);

	// Detect mobile viewport
	if (typeof window !== 'undefined') {
		const mediaQuery = window.matchMedia('(max-width: 767px)');
		isMobile = mediaQuery.matches;

		const updateMobile = (e: MediaQueryListEvent) => {
			isMobile = e.matches;
			// Clear cache when switching to force regeneration with new truncation
			highlightedEventJson = {};
		};

		mediaQuery.addEventListener('change', updateMobile);
	}

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

	// Truncate deep function
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

	async function toggleEventExpanded(idx: number, event: unknown) {
		if (expandedEventIdx === idx) {
			expandedEventIdx = null;
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
		}
	}

	// Auto-expand failed events
	$effect(() => {
		// Find the most recent failed event
		const failedEvents = displayableEvents.filter((e) => e.event.event_type === 'step:failed');
		if (failedEvents.length > 0) {
			const mostRecentFailed = failedEvents[failedEvents.length - 1];
			// Auto-expand it
			if (expandedEventIdx !== mostRecentFailed.idx) {
				toggleEventExpanded(mostRecentFailed.idx, mostRecentFailed.event);
			}
		}
	});
</script>

<Card class="h-full flex flex-col">
	<CardHeader class="pb-0 pt-2 px-3 flex-shrink-0 relative">
		<div class="flex items-center justify-between">
			<CardTitle class="text-sm">Event Stream ({displayableEvents.length})</CardTitle>
		</div>
	</CardHeader>
	<CardContent class="flex-1 overflow-auto pt-1 pb-2 px-3 min-h-0">
		<div class="space-y-1">
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
							<div class="flex items-center gap-2 px-2 py-1.5">
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
								<div class="px-2 pb-1.5" onclick={(e) => e.stopPropagation()}>
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
	</CardContent>
</Card>

<style>
	/* Event badge rows */
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
</style>
