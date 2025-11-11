<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { Button } from '$lib/components/ui/button';
	import { codeToHtml } from 'shiki';
	import type { createFlowState } from '$lib/stores/pgflow-state.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import MiniDAG from '$lib/components/MiniDAG.svelte';
	import { Clock, Workflow, Play, Hourglass, XCircle } from '@lucide/svelte';

	interface Props {
		selectedStep: string | null;
		visible: boolean;
		flowState: ReturnType<typeof createFlowState>;
		showMobileHeader?: boolean;
	}

	let { selectedStep, visible, flowState, showMobileHeader = true }: Props = $props();

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

	// Flow-level metadata for explanation
	const flowInfo = {
		name: 'article_flow',
		displayName: 'Article Processing Flow',
		description:
			'This flow processes web articles by fetching content, generating summaries and keywords, then publishing the results.',
		whatItDoes:
			'Demonstrates parallel execution, automatic retries, and dependency management—all core pgflow features.',
		reliabilityFeatures: [
			{
				setting: 'maxAttempts: 2',
				explanation: 'Automatically retries failed steps up to 3 times before giving up'
			}
		],
		inputType: `{
  url: string
}`,
		steps: ['fetchArticle', 'summarize', 'extractKeywords', 'publish']
	};

	// Step-level concept explanations (how pgflow works internally)
	const stepConcepts: Record<string, string> = {
		fetchArticle:
			'Root step with no dependencies. start_flow() creates a task and queues a message containing the task ID. ' +
			'Worker polls the queue, calls start_tasks() with the task ID to reserve the task and get its input, ' +
			'executes the handler, calls complete_task() to save the output. Tasks exist independently from queue messages, ' +
			'enabling both automated polling and manual reservation (future: human approval steps).',

		summarize:
			'Depends on fetchArticle. When fetchArticle completes, SQL Core checks dependencies, creates a task, and queues a message. ' +
			"Worker polls, calls start_tasks() which assembles input from both fetchArticle's output and the original run input, " +
			'executes the handler, calls complete_task().',

		extractKeywords:
			'Also depends on fetchArticle, so becomes ready alongside summarize. ' +
			'Both messages hit the queue simultaneously—parallel execution happens naturally as workers ' +
			'independently poll and start whichever task they receive first.',

		publish:
			'Depends on both summarize AND extractKeywords—blocked until both complete. ' +
			'After the second finishes, SQL Core finds publish ready, creates a task and queues a message. ' +
			'start_tasks() assembles input from both dependency outputs. After completion, no dependents remain ' +
			'and the run is marked completed.'
	};

	// Step metadata for explanation
	const stepInfo: Record<
		string,
		{
			name: string;
			displayName: string;
			whatItDoes: string;
			dependsOn: string[];
			dependents: string[];
			inputType: string;
			returns: string;
		}
	> = {
		fetchArticle: {
			name: 'fetchArticle',
			displayName: 'Fetch Article',
			whatItDoes:
				'Fetches article content from the provided URL using Jina Reader API. Returns structured content with title and text for downstream processing.',
			dependsOn: [],
			dependents: ['summarize', 'extractKeywords'],
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
			whatItDoes:
				'Generates a concise summary of the article content using an LLM. Runs in parallel with keyword extraction.',
			dependsOn: ['fetchArticle'],
			dependents: ['publish'],
			inputType: `{
  fetchArticle: {
    content: string
    title: string
  }
}`,
			returns: 'string'
		},
		extractKeywords: {
			name: 'extractKeywords',
			displayName: 'Extract Keywords',
			whatItDoes:
				'Extracts key terms and topics from the article using an LLM. Runs in parallel with summarization.',
			dependsOn: ['fetchArticle'],
			dependents: ['publish'],
			inputType: `{
  fetchArticle: {
    content: string
  }
}`,
			returns: 'string[]'
		},
		publish: {
			name: 'publish',
			displayName: 'Publish',
			whatItDoes:
				'Combines the summary and keywords and publishes the processed article. In this demo, returns a mock article ID—in production, this would insert into a database.',
			dependsOn: ['summarize', 'extractKeywords'],
			dependents: [],
			inputType: `{
  summarize: string
  extractKeywords: string[]
}`,
			returns: 'string'
		}
	};

	let panelElement: HTMLElement | undefined = $state(undefined);
	let highlightedInput = $state<string>('');
	let highlightedOutput = $state<string>('');
	let isMobile = $state(false);

	// Detect mobile viewport
	if (typeof window !== 'undefined') {
		const mediaQuery = window.matchMedia('(max-width: 767px)');
		isMobile = mediaQuery.matches;

		const updateMobile = (e: MediaQueryListEvent) => {
			isMobile = e.matches;
		};

		mediaQuery.addEventListener('change', updateMobile);
	}

	// Replace long strings with placeholders for mobile display
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

	// Generate syntax-highlighted input whenever input changes
	$effect(() => {
		const input = stepInput;
		if (input) {
			// Mobile: 50 chars, Desktop: 500 chars
			const maxLength = isMobile ? 50 : 500;
			const truncated = truncateDeep(input, maxLength);
			const jsonString = JSON.stringify(truncated, null, 2);
			codeToHtml(jsonString, {
				lang: 'json',
				theme: 'night-owl'
			}).then((html) => {
				highlightedInput = html;
			});
		} else {
			highlightedInput = '';
		}
	});

	// Generate syntax-highlighted output whenever output changes
	$effect(() => {
		const output = stepOutput;
		if (output) {
			// Mobile: 50 chars, Desktop: 500 chars
			const maxLength = isMobile ? 50 : 500;
			const truncated = truncateDeep(output, maxLength);
			const jsonString = JSON.stringify(truncated, null, 2);
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

	// Get step output from reactive step() method
	const stepOutput = $derived(selectedStep ? flowState.step(selectedStep).output : null);

	// Get step error from reactive step() method
	const stepError = $derived(selectedStep ? flowState.step(selectedStep).error : null);

	// Get actual input for the selected step
	const stepInput = $derived.by(() => {
		if (!selectedStep || !currentStepInfo || !flowState.run) return null;

		// Only show input if step is started or completed
		// Use reactive step() method from runState
		const stepStatus = flowState.step(selectedStep).status;
		if (stepStatus !== 'started' && stepStatus !== 'completed') return null;

		// For steps with dependencies, check if all dependencies are completed
		if (currentStepInfo.dependsOn.length > 0) {
			const allDepsCompleted = currentStepInfo.dependsOn.every((dep) => {
				// Use reactive step() method from runState
				return flowState.step(dep).status === 'completed';
			});
			if (!allDepsCompleted) return null;
		}

		const input: Record<string, unknown> = {};

		// Always add run input (URL) from flowState.run if available
		if (flowState.run.input) {
			input.run = flowState.run.input;
		}

		// Add outputs from dependencies using reactive step() method
		for (const dep of currentStepInfo.dependsOn) {
			const depOutput = flowState.step(dep).output;
			if (depOutput !== undefined) {
				input[dep] = depOutput;
			}
		}

		return Object.keys(input).length > 0 ? input : null;
	});

	// Get current step status
	function getStepStatus(stepSlug: string): string | null {
		// Use reactive step() method from runState
		const status = flowState.step(stepSlug).status;
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
		<!-- Header: Desktop only (mobile has inline code + no header) -->
		<div class="hidden md:block sticky top-0 z-10 bg-card border-b pb-2 pt-3 px-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					{#if currentStepInfo}
						<h3 class="text-sm font-semibold">
							Step <code class="bg-muted px-2 py-0.5 rounded text-sm font-mono"
								>{currentStepInfo.name}</code
							>
						</h3>
					{:else}
						<h3 class="text-sm font-semibold">
							Flow <code class="bg-muted px-2 py-0.5 rounded text-sm font-mono"
								>{flowInfo.name}</code
							>
						</h3>
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
		</div>

		<!-- Header: Mobile only (status + close, no title since code is shown above) -->
		{#if showMobileHeader}
			<div
				class="md:hidden sticky top-0 z-10 bg-card border-b p-3 flex items-center justify-end gap-3"
			>
				{#if stepStatus}
					<StatusBadge status={stepStatus} variant="icon-only" size="lg" />
				{/if}
				<button onclick={() => dispatch('close')} class="text-muted-foreground text-xl leading-none"
					>✕</button
				>
			</div>
		{/if}

		<div class="explanation-content text-sm p-4 pb-18 md:pb-4 space-y-3">
			{#if currentStepInfo}
				{#key selectedStep}
					<div in:fade={{ duration: 300, delay: 150 }} out:fade={{ duration: 150 }}>
						<!-- What it does + MiniDAG side by side on mobile -->
						<div class="flex gap-3 items-start smooth-content-transition">
							<p class="text-foreground leading-relaxed flex-1">
								{currentStepInfo.whatItDoes}
							</p>
							{#if selectedStep !== 'flow_config'}
								<button
									class="md:hidden flex-shrink-0 w-32 h-28 -mt-1 opacity-70 hover:opacity-90 transition-opacity cursor-pointer"
									onclick={() => {
										dispatch('step-selected', { stepSlug: null });
										dispatch('close');
									}}
									aria-label="Close explanation panel"
								>
									<MiniDAG {selectedStep} {flowState} />
								</button>
							{/if}
						</div>

						<!-- Concept explainer (collapsible) -->
						<details
							class="concept-explainer mt-3 mb-3 bg-background/50 border border-border rounded-lg"
						>
							<summary
								class="font-semibold text-sm text-foreground cursor-pointer hover:bg-background/80 flex items-center gap-2 p-3 rounded-lg transition-colors"
							>
								<span class="concept-caret">▸</span>
								<span class="flex-1">How this step works in pgflow</span>
							</summary>
							<div class="text-xs text-muted-foreground leading-relaxed px-3 pb-3">
								{stepConcepts[currentStepInfo.name]}
							</div>
						</details>

						<!-- Step-level view: Single column stacked layout -->
						<div class="space-y-4 smooth-content-transition">
							<!-- Dependencies (auto-layout with wrap) -->
							<div class="flex flex-wrap gap-3 smooth-content-transition">
								<!-- Waits for (only show if has dependencies) -->
								{#if currentStepInfo.dependsOn.length > 0}
									<div class="min-w-[140px] flex-1">
										<div
											class="font-semibold text-muted-foreground mb-1.5 text-sm flex items-center gap-1.5"
										>
											<Clock class="w-3.5 h-3.5 -mb-0.5" />
											Waits for
										</div>
										<div
											class="flex {currentStepInfo.dependsOn.length === 2
												? 'flex-row'
												: 'flex-col'} gap-1.5"
										>
											{#each currentStepInfo.dependsOn as dep (dep)}
												<button
													class="font-mono text-sm px-2 py-1.5 rounded bg-secondary hover:bg-secondary/80 transition-all duration-200 cursor-pointer border border-transparent hover:border-blue-500 text-left {currentStepInfo
														.dependsOn.length === 2
														? 'flex-1'
														: ''}"
													onclick={(e) => handleDependencyClick(dep, e)}
													onmouseenter={() => handleDependencyHover(dep)}
													onmouseleave={() => handleDependencyHover(null)}
												>
													{dep}
												</button>
											{/each}
										</div>
									</div>
								{/if}

								<!-- Required by (only show if has dependents) -->
								{#if currentStepInfo.dependents.length > 0}
									<div class="min-w-[140px] flex-1">
										<div
											class="font-semibold text-muted-foreground mb-1.5 text-sm flex items-center gap-1.5"
										>
											<Workflow class="w-3.5 h-3.5 -mb-0.5" />
											Required by
										</div>
										<div
											class="flex {currentStepInfo.dependents.length === 2
												? 'flex-row'
												: 'flex-col'} gap-1.5"
										>
											{#each currentStepInfo.dependents as dep (dep)}
												<button
													class="font-mono text-sm px-2 py-1.5 rounded bg-secondary hover:bg-secondary/80 transition-all duration-200 cursor-pointer border border-transparent hover:border-blue-500 text-left {currentStepInfo
														.dependents.length === 2
														? 'flex-1'
														: ''}"
													onclick={(e) => handleDependencyClick(dep, e)}
													onmouseenter={() => handleDependencyHover(dep)}
													onmouseleave={() => handleDependencyHover(null)}
												>
													{dep}
												</button>
											{/each}
										</div>
									</div>
								{/if}
							</div>

							{#if stepStatus === 'failed' && stepError}
								<!-- Error Message (shown instead of Input/Output when step fails) -->
								<div>
									<div class="font-semibold text-red-400 mb-1.5 text-sm flex items-center gap-2">
										<XCircle class="w-4 h-4" />
										Error
									</div>
									<div class="error-box">
										<pre
											class="text-sm text-red-200 whitespace-pre-wrap break-words m-0">{stepError}</pre>
									</div>
								</div>
							{:else}
								<!-- Actual Input -->
								<div>
									<div class="font-semibold text-muted-foreground mb-1.5 text-sm">Input</div>
									{#if highlightedInput}
										<div class="input-type-box">
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											{@html highlightedInput}
										</div>
									{:else if flowState.status === 'idle'}
										<div
											class="bg-secondary/30 rounded p-3 text-xs text-muted-foreground flex items-center justify-center gap-2"
										>
											<Play class="w-3.5 h-3.5" />
											<span>Run the workflow to see input</span>
										</div>
									{:else if currentStepInfo && currentStepInfo.dependsOn.length > 0}
										{@const incompleteDeps = currentStepInfo.dependsOn.filter(
											(dep) => getStepStatus(dep) !== 'completed'
										)}
										{#if incompleteDeps.length > 0}
											<div
												class="bg-secondary/30 rounded p-3 text-xs text-muted-foreground flex items-center justify-center gap-2"
											>
												<Clock class="w-3.5 h-3.5" />
												<span>Waiting for {incompleteDeps.join(', ')} to complete</span>
											</div>
										{:else}
											<div
												class="bg-secondary/30 rounded p-3 text-xs text-muted-foreground flex items-center justify-center gap-2"
											>
												<Clock class="w-3.5 h-3.5" />
												<span>Waiting for step to start</span>
											</div>
										{/if}
									{:else}
										<div
											class="bg-secondary/30 rounded p-3 text-xs text-muted-foreground flex items-center justify-center gap-2"
										>
											<Clock class="w-3.5 h-3.5" />
											<span>Waiting for step to start</span>
										</div>
									{/if}
								</div>

								<!-- Actual Output -->
								<div>
									<div class="font-semibold text-muted-foreground mb-1.5 text-sm">Output</div>
									{#if highlightedOutput}
										<div class="output-box">
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											{@html highlightedOutput}
										</div>
									{:else if flowState.status === 'idle'}
										<div
											class="bg-secondary/30 rounded p-3 text-xs text-muted-foreground flex items-center justify-center gap-2"
										>
											<Play class="w-3.5 h-3.5" />
											<span>Run the workflow to see output</span>
										</div>
									{:else if stepStatus === 'started'}
										<div
											class="bg-secondary/30 rounded p-3 text-xs text-muted-foreground flex items-center justify-center gap-2"
										>
											<Hourglass class="w-3.5 h-3.5" />
											<span>Step is running...</span>
										</div>
									{:else}
										<div
											class="bg-secondary/30 rounded p-3 text-xs text-muted-foreground flex items-center justify-center gap-2"
										>
											<Clock class="w-3.5 h-3.5" />
											<span>Waiting for step to complete</span>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				{/key}
			{:else}
				<!-- Flow-level view -->
				<div class="space-y-4">
					<!-- What it does -->
					<p class="text-foreground leading-relaxed">
						Processes web articles by fetching content, generating summaries and keywords in
						parallel, then publishing the results. Demonstrates parallel execution, automatic
						retries, and dependency management.
					</p>

					<!-- How orchestration works (collapsible) -->
					<details class="concept-explainer bg-background/50 border border-border rounded-lg" open>
						<summary
							class="font-semibold text-sm text-foreground cursor-pointer hover:bg-background/80 flex items-center gap-2 p-3 rounded-lg transition-colors"
						>
							<span class="concept-caret">▸</span>
							<span class="flex-1">How pgflow orchestrates this flow</span>
						</summary>
						<div class="text-xs text-muted-foreground leading-relaxed px-3 pb-3 space-y-2">
							<p>
								<code class="bg-muted px-1 rounded font-mono">start_flow()</code> creates a run and initializes
								state for each step. Root steps (no dependencies) get tasks queued immediately.
							</p>
							<p>
								<strong>Edge Function worker</strong> polls the queue, calls
								<code class="bg-muted px-1 rounded font-mono">start_tasks()</code> to reserve tasks,
								executes handlers, then calls
								<code class="bg-muted px-1 rounded font-mono">complete_task()</code> to save outputs.
							</p>
							<p>
								<strong>SQL Core</strong> checks dependencies after each completion, creates tasks
								for steps with all dependencies met, and marks the run complete when
								<code class="bg-muted px-1 rounded font-mono">remaining_steps = 0</code>.
							</p>
							<p>
								<strong>Supabase Realtime</strong> broadcasts state changes back to this UI for live
								updates.
							</p>
						</div>
					</details>

					<!-- Reliability Features -->
					<div>
						<div class="font-semibold text-muted-foreground mb-1.5 text-sm">
							Reliability Configuration
						</div>
						<div class="space-y-2">
							{#each flowInfo.reliabilityFeatures as feature (feature.setting)}
								<div class="bg-secondary/50 rounded p-2.5">
									<code class="text-xs font-mono text-primary">{feature.setting}</code>
									<p class="text-xs text-muted-foreground mt-1">{feature.explanation}</p>
								</div>
							{/each}
						</div>
					</div>

					<!-- Steps -->
					<div>
						<div class="font-semibold text-muted-foreground mb-1.5 text-sm">Steps</div>
						<div class="flex flex-col gap-1.5">
							{#each flowInfo.steps as step (step)}
								<button
									class="font-mono text-sm px-2 py-1.5 rounded bg-secondary hover:bg-secondary/80 transition-all duration-200 cursor-pointer border border-transparent hover:border-blue-500 text-left"
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
		</div>
	</div>
{/if}

<style>
	.explanation-panel-wrapper {
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
		display: table;
		min-width: 100%;
	}

	.output-box :global(pre) {
		margin: 0 !important;
		padding: 10px 12px !important;
		background: #0d1117 !important;
		border-radius: 4px;
		font-size: 13px;
		line-height: 1.6;
		display: table;
		min-width: 100%;
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

	/* Smooth content transitions to prevent abrupt jumping */
	.smooth-content-transition {
		transition:
			height 0.3s ease-out,
			min-height 0.3s ease-out,
			max-height 0.3s ease-out;
	}

	/* Error box styling */
	.error-box {
		background: rgba(220, 38, 38, 0.15);
		border: 1px solid rgba(239, 68, 68, 0.5);
		border-radius: 6px;
		padding: 12px 14px;
		max-height: 400px;
		overflow-y: auto;
	}

	.error-box::-webkit-scrollbar {
		width: 6px;
		height: 6px;
	}

	.error-box::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 3px;
	}

	.error-box::-webkit-scrollbar-thumb {
		background: rgba(239, 68, 68, 0.3);
		border-radius: 3px;
	}

	.error-box::-webkit-scrollbar-thumb:hover {
		background: rgba(239, 68, 68, 0.5);
	}

	/* Concept explainer caret rotation */
	.concept-caret {
		display: inline-block;
		transition: transform 0.2s ease;
	}

	details[open] .concept-caret {
		transform: rotate(90deg);
	}

	/* Hide default disclosure triangle */
	.concept-explainer summary {
		list-style: none;
	}

	.concept-explainer summary::-webkit-details-marker {
		display: none;
	}
</style>
