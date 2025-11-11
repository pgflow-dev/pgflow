<script lang="ts">
	import type { createFlowState } from '$lib/stores/pgflow-state-improved.svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		flowState: ReturnType<typeof createFlowState>;
	}

	let { flowState }: Props = $props();

	let eventStreamExpanded = $state(true);
	let expandedSteps = $state<Set<string>>(new Set(['fetch_article']));
	let expandedEvents = $state<Set<number>>(new Set());

	function toggleEventStream() {
		eventStreamExpanded = !eventStreamExpanded;
	}

	function toggleStep(stepSlug: string) {
		const newSet = new Set(expandedSteps);
		if (newSet.has(stepSlug)) {
			newSet.delete(stepSlug);
		} else {
			newSet.add(stepSlug);
		}
		expandedSteps = newSet;
	}

	function toggleEvent(index: number) {
		const newSet = new Set(expandedEvents);
		if (newSet.has(index)) {
			newSet.delete(index);
		} else {
			newSet.add(index);
		}
		expandedEvents = newSet;
	}

	function formatTimestamp(timestamp: Date): string {
		return timestamp.toLocaleTimeString('en-US', {
			hour12: false,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			fractionalSecondDigits: 3
		});
	}

	function getStepStatus(stepSlug: string): string {
		return flowState.stepStatuses[stepSlug] || 'pending';
	}

	function getStepOutput(stepSlug: string): any {
		// Output will be in the events, find the completed event for this step
		const completedEvent = flowState.events
			.slice()
			.reverse()
			.find(
				(e) =>
					e.event_type === 'step:completed' && e.data?.step_slug === stepSlug
			);
		return completedEvent?.data?.output;
	}

	function getStepError(stepSlug: string): string | null {
		// Error will be in the events, find the failed event for this step
		const failedEvent = flowState.events
			.slice()
			.reverse()
			.find(
				(e) =>
					e.event_type === 'step:failed' && e.data?.step_slug === stepSlug
			);
		return failedEvent?.data?.error_message || null;
	}

	function truncateOutput(output: any): string {
		const str = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
		if (str.length > 200) {
			return str.substring(0, 200) + '...';
		}
		return str;
	}

	const stepSlugs = ['fetch_article', 'summarize', 'extract_keywords', 'publish'];

	function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
		switch (status) {
			case 'completed':
				return 'default';
			case 'in_progress':
			case 'started':
				return 'secondary';
			case 'failed':
				return 'destructive';
			default:
				return 'outline';
		}
	}
</script>

<div class="flex flex-col h-full">
	<!-- Run Information - Sticky Header -->
	<div class="sticky top-0 bg-card flex items-center justify-between text-xs pb-3 border-b">
		<Badge variant="outline">{flowState.run?.flow_slug || 'article_flow'}</Badge>
		<code class="text-muted-foreground font-mono">{flowState.run?.run_id?.substring(0, 8) || 'N/A'}...</code>
		<Badge variant={getStatusVariant(flowState.status)}>{flowState.status}</Badge>
	</div>

	<div class="flex-1 overflow-y-auto pt-4 space-y-4">

		<!-- Step States -->
		<div class="space-y-2">
		<h3 class="text-sm font-semibold">Step States</h3>
		<div class="space-y-2">
			{#each stepSlugs as stepSlug}
				{@const status = getStepStatus(stepSlug)}
				{@const output = getStepOutput(stepSlug)}
				{@const error = getStepError(stepSlug)}
				{@const isExpanded = expandedSteps.has(stepSlug)}

				<div class="border-l-2 border-primary/20 pl-3">
					<button
						class="flex items-center justify-between w-full text-left py-1"
						onclick={() => toggleStep(stepSlug)}
					>
						<div class="flex items-center gap-2">
							<span class="font-medium text-sm">{stepSlug}</span>
							<Badge variant={getStatusVariant(status)} class="text-xs">{status}</Badge>
						</div>
						<span class="text-muted-foreground text-xs">{isExpanded ? '▼' : '▶'}</span>
					</button>

					{#if isExpanded}
						<div class="mt-2 space-y-2">
							{#if error}
								<div class="text-sm text-destructive bg-destructive/10 p-2 rounded">
									<strong>Error:</strong>
									{error}
								</div>
							{/if}
							{#if output}
								<div class="space-y-1">
									<span class="text-xs text-muted-foreground">Output:</span>
									<pre class="text-xs bg-muted p-2 rounded overflow-x-auto">{truncateOutput(output)}</pre>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
			</div>
		</div>

			<!-- Event Stream -->
		<div class="flex-1 flex flex-col">
			<button
				class="flex items-center justify-between w-full text-left mb-2"
				onclick={toggleEventStream}
			>
				<h3 class="text-sm font-semibold">📨 Event Stream</h3>
				<span class="text-muted-foreground text-xs">{eventStreamExpanded ? '▼' : '▶'}</span>
			</button>

			{#if eventStreamExpanded}
				<div class="flex-1 overflow-y-auto space-y-1">
					{#if flowState.events.length === 0}
						<p class="text-sm text-muted-foreground text-center py-8">
							No events yet. Start a flow to see events.
						</p>
					{:else}
						{#each flowState.events as event, index}
							{@const eventType = event.event_type}
							{@const stepSlug = event.data?.step_slug}
							{@const variant = eventType.includes('failed')
								? 'destructive'
								: eventType.includes('completed')
									? 'default'
									: 'secondary'}
							{@const isExpanded = expandedEvents.has(index)}

							<div class="border-l-2 border-muted pl-2 py-1">
								<button
									class="flex items-center gap-2 w-full text-left hover:bg-muted/20 px-1 rounded"
									onclick={() => toggleEvent(index)}
								>
									<code class="text-xs text-muted-foreground font-mono">{formatTimestamp(event.timestamp)}</code>
									{#if stepSlug}
										<span class="text-xs font-medium">{stepSlug}</span>
									{/if}
									<Badge {variant} class="text-xs">{eventType}</Badge>
									<span class="text-muted-foreground text-xs ml-auto">{isExpanded ? '▼' : '▶'}</span>
								</button>
								{#if isExpanded}
									<pre class="text-xs bg-background/50 p-2 rounded overflow-x-auto max-h-32 mt-1">{JSON.stringify(event.data, null, 2)}</pre>
								{/if}
							</div>
						{/each}
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
