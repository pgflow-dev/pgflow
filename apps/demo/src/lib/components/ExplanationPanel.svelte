<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { codeToHtml } from 'shiki';
	import type { createFlowState } from '$lib/stores/pgflow-state-improved.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	interface Props {
		selectedStep: string | null;
		hoveredStep: string | null;
		visible: boolean;
		flowState: ReturnType<typeof createFlowState>;
	}

	let { selectedStep, hoveredStep, visible, flowState }: Props = $props();

	const dispatch = createEventDispatcher<{
		close: void;
		'step-selected': { stepSlug: string };
		'step-hovered': { stepSlug: string | null };
	}>();

	function handleDependencyClick(stepSlug: string, event: MouseEvent) {
		console.log('ExplanationPanel: Dependency clicked:', stepSlug);
		event.stopPropagation(); // Prevent click-outside from triggering
		// Clear hover state before navigating
		dispatch('step-hovered', { stepSlug: null });
		dispatch('step-selected', { stepSlug });
	}

	function handleDependencyHover(stepSlug: string | null) {
		dispatch('step-hovered', { stepSlug });
	}

	// Check if a dependency button should be dimmed (when hovering something else)
	function isDepDimmed(depSlug: string): boolean {
		return hoveredStep !== null && hoveredStep !== depSlug;
	}

	// Flow-level metadata for explanation
	const flowInfo = {
		name: 'article_flow',
		displayName: 'Article Processing Flow',
		description:
			'This flow processes web articles by fetching content, generating summaries and keywords, then publishing the results.',
		inputType: `{
  url: string
}`,
		steps: ['fetch_article', 'summarize', 'extract_keywords', 'publish']
	};

	// Step metadata for explanation
	const stepInfo: Record<
		string,
		{
			name: string;
			displayName: string;
			dependsOn: string[];
			dependents: string[];
			inputType: string;
			returns: string;
		}
	> = {
		fetch_article: {
			name: 'fetch_article',
			displayName: 'Fetch Article',
			dependsOn: [],
			dependents: ['summarize', 'extract_keywords'],
			inputType: `{
  run: {
    url: string
  }
}`,
			returns: `{
  content: string
  title: string
}`
		},
		summarize: {
			name: 'summarize',
			displayName: 'Summarize',
			dependsOn: ['fetch_article'],
			dependents: ['publish'],
			inputType: `{
  fetch_article: {
    content: string
    title: string
  }
}`,
			returns: 'string'
		},
		extract_keywords: {
			name: 'extract_keywords',
			displayName: 'Extract Keywords',
			dependsOn: ['fetch_article'],
			dependents: ['publish'],
			inputType: `{
  fetch_article: {
    content: string
  }
}`,
			returns: 'string[]'
		},
		publish: {
			name: 'publish',
			displayName: 'Publish',
			dependsOn: ['summarize', 'extract_keywords'],
			dependents: [],
			inputType: `{
  summarize: string
  extract_keywords: string[]
}`,
			returns: 'string'
		}
	};

	let panelElement: HTMLElement | undefined = $state(undefined);
	let highlightedInputType = $state<string>('');
	let highlightedReturnType = $state<string>('');
	let highlightedOutput = $state<string>('');

	// Generate syntax-highlighted types whenever step changes
	$effect(() => {
		const info = currentStepInfo;
		const isFlowLevel = !selectedStep;

		if (isFlowLevel) {
			// Show flow-level input type
			codeToHtml(flowInfo.inputType, {
				lang: 'typescript',
				theme: 'night-owl'
			}).then((html) => {
				highlightedInputType = html;
			});
			highlightedReturnType = '';
		} else if (info) {
			// Highlight step input type
			codeToHtml(info.inputType, {
				lang: 'typescript',
				theme: 'night-owl'
			}).then((html) => {
				highlightedInputType = html;
			});

			// Highlight return type
			codeToHtml(info.returns, {
				lang: 'typescript',
				theme: 'night-owl'
			}).then((html) => {
				highlightedReturnType = html;
			});
		} else {
			highlightedInputType = '';
			highlightedReturnType = '';
		}
	});

	// Generate syntax-highlighted output whenever output changes
	$effect(() => {
		const output = stepOutput;
		if (output) {
			const jsonString = JSON.stringify(output, null, 2);
			codeToHtml(jsonString, {
				lang: 'json',
				theme: 'night-owl'
			}).then((html) => {
				highlightedOutput = html;
			});
		} else {
			highlightedOutput = '';
		}
	});

	// Handle ESC key
	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && visible) {
			dispatch('close');
		}
	}

	onMount(() => {
		document.addEventListener('keydown', handleKeyDown);

		return () => {
			document.removeEventListener('keydown', handleKeyDown);
		};
	});

	const currentStepInfo = $derived(
		selectedStep && stepInfo[selectedStep] ? stepInfo[selectedStep] : null
	);

	// Get step output from events
	const stepOutput = $derived.by(() => {
		if (!selectedStep) return null;
		// Find the latest completed event for this step
		const stepEvents = flowState.events.filter((e) => e.data?.step_slug === selectedStep).reverse();
		const completedEvent = stepEvents.find((e) => e.event_type === 'step:completed');
		return completedEvent?.data?.output || null;
	});

	// Get current step status
	function getStepStatus(stepSlug: string): string | null {
		const status = flowState.stepStatuses[stepSlug];
		const hasFlowStarted = flowState.status !== 'idle';

		// Don't show badge if flow hasn't started yet
		if (!hasFlowStarted) {
			return null;
		}

		return status;
	}

	// Get current step status
	const stepStatus = $derived(selectedStep ? getStepStatus(selectedStep) : null);
</script>

{#if visible}
	<div class="explanation-panel-wrapper" bind:this={panelElement}>
		<Card class="explanation-card p-0">
			<CardHeader class="explanation-header pb-2 pt-3">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						{#if currentStepInfo}
							<CardTitle class="text-sm">
								Step <code class="bg-muted px-2 py-0.5 rounded text-sm font-mono"
									>{currentStepInfo.name}</code
								>
							</CardTitle>
						{:else}
							<CardTitle class="text-sm">
								Flow <code class="bg-muted px-2 py-0.5 rounded text-sm font-mono"
									>{flowInfo.name}</code
								>
							</CardTitle>
						{/if}
					</div>
					<div class="flex items-center gap-3">
						{#if stepStatus}
							<span class="status-label status-{stepStatus}">{stepStatus}</span>
							<StatusBadge status={stepStatus} variant="icon-only" size="xl" />
						{/if}
						<Button
							variant="ghost"
							size="sm"
							class="text-lg cursor-pointer"
							onclick={() => dispatch('close')}>✕</Button
						>
					</div>
				</div>
			</CardHeader>
			<CardContent class="explanation-content text-sm pb-4 space-y-3">
				{#if currentStepInfo}
					<!-- Step-level view: 2-column layout: Dependencies | Inputs/Returns -->
					<div class="grid grid-cols-2 gap-4">
						<!-- Left Column: Dependencies -->
						<div class="space-y-3">
							<!-- Depends On -->
							<div>
								<div class="font-semibold text-muted-foreground mb-1.5 text-sm">Depends On</div>
								{#if currentStepInfo.dependsOn.length === 0}
									<Badge variant="secondary" class="text-xs">None</Badge>
								{:else}
									<div class="flex flex-col gap-1.5">
										{#each currentStepInfo.dependsOn as dep}
											<button
												class="font-mono text-sm px-2 py-1.5 rounded bg-secondary hover:bg-secondary/80 transition-all duration-200 cursor-pointer border border-transparent hover:border-blue-500 text-left {isDepDimmed(
													dep
												)
													? 'opacity-30'
													: 'opacity-100'}"
												onclick={(e) => handleDependencyClick(dep, e)}
												onmouseenter={() => handleDependencyHover(dep)}
												onmouseleave={() => handleDependencyHover(null)}
											>
												{dep}
											</button>
										{/each}
									</div>
								{/if}
							</div>

							<!-- Dependents -->
							<div>
								<div class="font-semibold text-muted-foreground mb-1.5 text-sm">Dependents</div>
								{#if currentStepInfo.dependents.length === 0}
									<Badge variant="secondary" class="text-xs">None</Badge>
								{:else}
									<div class="flex flex-col gap-1.5">
										{#each currentStepInfo.dependents as dep}
											<button
												class="font-mono text-sm px-2 py-1.5 rounded bg-secondary hover:bg-secondary/80 transition-all duration-200 cursor-pointer border border-transparent hover:border-blue-500 text-left {isDepDimmed(
													dep
												)
													? 'opacity-30'
													: 'opacity-100'}"
												onclick={(e) => handleDependencyClick(dep, e)}
												onmouseenter={() => handleDependencyHover(dep)}
												onmouseleave={() => handleDependencyHover(null)}
											>
												{dep}
											</button>
										{/each}
									</div>
								{/if}
							</div>
						</div>

						<!-- Right Column: Inputs/Returns -->
						<div class="space-y-3">
							<!-- Inputs -->
							<div>
								<div class="font-semibold text-muted-foreground mb-1.5 text-sm">Input Type</div>
								<div class="input-type-box">
									{@html highlightedInputType}
								</div>
							</div>

							<!-- Returns -->
							<div>
								<div class="font-semibold text-muted-foreground mb-1.5 text-sm">Return Type</div>
								<div class="return-type-box">
									{@html highlightedReturnType}
								</div>
							</div>
						</div>
					</div>
				{:else}
					<!-- Flow-level view -->
					<div class="space-y-3">
						<!-- Description -->
						<div>
							<div class="font-semibold text-muted-foreground mb-1.5 text-sm">Description</div>
							<p class="text-foreground leading-relaxed">{flowInfo.description}</p>
						</div>

						<!-- Flow Input -->
						<div>
							<div class="font-semibold text-muted-foreground mb-1.5 text-sm">Flow Input Type</div>
							<div class="input-type-box">
								{@html highlightedInputType}
							</div>
							<p class="text-muted-foreground text-xs mt-1.5">
								Start this flow with a URL object. The flow will fetch the article, process it, and
								publish the results.
							</p>
						</div>

						<!-- Steps -->
						<div>
							<div class="font-semibold text-muted-foreground mb-1.5 text-sm">Steps</div>
							<div class="flex flex-col gap-1.5">
								{#each flowInfo.steps as step}
									<button
										class="font-mono text-sm px-2 py-1.5 rounded bg-secondary hover:bg-secondary/80 transition-all duration-200 cursor-pointer border border-transparent hover:border-blue-500 text-left {isDepDimmed(
											step
										)
											? 'opacity-30'
											: 'opacity-100'}"
										onclick={(e) => handleDependencyClick(step, e)}
										onmouseenter={() => handleDependencyHover(step)}
										onmouseleave={() => handleDependencyHover(null)}
									>
										{step}
									</button>
								{/each}
							</div>
						</div>
					</div>
				{/if}

				<!-- Output section (full-width, shown when available) -->
				{#if stepOutput && highlightedOutput}
					<div class="pt-1">
						<div class="font-semibold text-muted-foreground mb-1.5 text-sm">Output</div>
						<div class="output-box">
							{@html highlightedOutput}
						</div>
					</div>
				{/if}
			</CardContent>
		</Card>
	</div>
{/if}

<style>
	.explanation-panel-wrapper {
		animation: slideIn 0.2s ease-out;
		display: flex;
		flex-direction: column;
		height: 100%; /* Fill available space from parent flex-1 */
		min-height: 0; /* Allow flex shrinking */
	}

	.explanation-card {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0; /* Allow flex shrinking */
		overflow: hidden; /* Contain scrolling to content area */
		height: 100%; /* Fill wrapper */
	}

	.explanation-header {
		flex-shrink: 0; /* Keep header always visible */
	}

	.explanation-content {
		overflow-y: auto; /* Make content scrollable */
		overflow-x: hidden;
		flex: 1;
		min-height: 0; /* Enable scrolling in flex context */
		scroll-behavior: smooth;
	}

	/* Custom scrollbar styling */
	.explanation-content::-webkit-scrollbar {
		width: 8px;
	}

	.explanation-content::-webkit-scrollbar-track {
		background: transparent;
	}

	.explanation-content::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 4px;
	}

	.explanation-content::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Input and return type syntax highlighting boxes */
	.input-type-box,
	.return-type-box {
		border-radius: 4px;
		overflow: auto;
		max-height: 12rem; /* Compact for input/return types */
		scroll-behavior: smooth;
	}

	.output-box {
		border-radius: 4px;
		overflow: auto;
		max-height: 20rem; /* Allow more space for output data */
		scroll-behavior: smooth;
	}

	/* Custom scrollbar for code boxes */
	.input-type-box::-webkit-scrollbar,
	.return-type-box::-webkit-scrollbar,
	.output-box::-webkit-scrollbar {
		width: 6px;
		height: 6px;
	}

	.input-type-box::-webkit-scrollbar-track,
	.return-type-box::-webkit-scrollbar-track,
	.output-box::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 3px;
	}

	.input-type-box::-webkit-scrollbar-thumb,
	.return-type-box::-webkit-scrollbar-thumb,
	.output-box::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.15);
		border-radius: 3px;
	}

	.input-type-box::-webkit-scrollbar-thumb:hover,
	.return-type-box::-webkit-scrollbar-thumb:hover,
	.output-box::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.25);
	}

	.input-type-box :global(pre),
	.return-type-box :global(pre) {
		margin: 0 !important;
		padding: 8px 10px !important;
		background: #0d1117 !important;
		border-radius: 4px;
		font-size: 13px;
		line-height: 1.6;
	}

	.output-box :global(pre) {
		margin: 0 !important;
		padding: 10px 12px !important;
		background: #0d1117 !important;
		border-radius: 4px;
		font-size: 13px;
		line-height: 1.6;
	}

	.input-type-box :global(code),
	.return-type-box :global(code) {
		font-family: 'Fira Code', 'Monaco', 'Menlo', 'Courier New', monospace;
		white-space: pre;
		display: block;
	}

	.output-box :global(code) {
		font-family: 'Fira Code', 'Monaco', 'Menlo', 'Courier New', monospace;
		white-space: pre-wrap;
		word-break: break-word;
		display: block;
	}

	/* Status labels */
	.status-label {
		font-size: 0.875rem;
		font-weight: 600;
		text-transform: lowercase;
		line-height: 1;
		display: flex;
		align-items: center;
	}

	.status-completed {
		color: #20a56f;
	}

	.status-started {
		color: #5b8def;
	}

	.status-failed {
		color: #f08060;
	}

	.status-created {
		color: #607b75;
	}
</style>
