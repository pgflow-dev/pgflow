<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';

	interface Props {
		visible: boolean;
		hasRun: boolean;
		onRunFlow: () => void;
		onDismiss: () => void;
	}

	let { visible, hasRun, onRunFlow, onDismiss }: Props = $props();

	// Handle ESC key
	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && visible) {
			onDismiss();
		}
	}

	onMount(() => {
		document.addEventListener('keydown', handleKeyDown);

		return () => {
			document.removeEventListener('keydown', handleKeyDown);
		};
	});
</script>

{#if visible}
	<!-- Click outside to dismiss -->
	<div class="modal-overlay" onclick={onDismiss}>
		<Card class="welcome-card" onclick={(e) => e.stopPropagation()}>
			<CardHeader class="pb-3">
				{#if !hasRun}
					<div class="flex flex-col items-center gap-3">
						<img src="/pgflow-logo-dark.svg" alt="pgflow" class="h-16" />
						<CardTitle class="text-xl text-center">Postgres-native workflow orchestration</CardTitle>
					</div>
				{:else}
					<CardTitle class="text-xl text-center">Workflow Complete</CardTitle>
				{/if}
			</CardHeader>
			<CardContent class="space-y-4">
				{#if !hasRun}
					<!-- First-time welcome -->
					<div class="space-y-4">
						<p class="text-base text-muted-foreground text-center">
							This demo processes an article through 4 steps with parallel execution.
							<strong class="text-foreground">20 lines of TypeScript.</strong>
						</p>

						<div class="text-sm text-muted-foreground space-y-2 bg-accent/30 border border-border rounded p-3">
							<div class="font-semibold text-foreground mb-1">
								vs. hand-rolling with pgmq + Edge Functions:
							</div>
							<div class="text-xs">• 250+ lines of queue management</div>
							<div class="text-xs">• Manual state tracking and coordination</div>
							<div class="text-xs">• Custom retry logic for each step</div>
						</div>

						<div class="text-sm space-y-1.5">
							<div class="text-foreground font-semibold">Everything runs in Postgres:</div>
							<div class="text-muted-foreground text-xs">
								✓ Built-in retries with exponential backoff
							</div>
							<div class="text-muted-foreground text-xs">✓ Parallel execution (DAG-based)</div>
							<div class="text-muted-foreground text-xs">✓ Full observability via SQL queries</div>
							<div class="text-muted-foreground text-xs">✓ No Bull, Redis, or Temporal needed</div>
						</div>

						<div class="py-3 space-y-2">
							<Button onclick={onRunFlow} size="lg" class="w-full cursor-pointer">
								Run the Demo
							</Button>
							<button
								onclick={onDismiss}
								class="text-sm text-muted-foreground hover:text-foreground w-full cursor-pointer"
							>
								Explore code first
							</button>
						</div>

						<p class="text-xs text-muted-foreground text-center pt-2 border-t border-border">
							Click any step in code or DAG to inspect inputs, outputs, and dependencies
						</p>
					</div>
				{:else}
					<!-- Post-run explanation -->
					<div class="space-y-3">
						<div class="text-sm space-y-2">
							<div class="font-semibold text-foreground">Execution flow:</div>
							<div class="text-muted-foreground text-xs">1. fetch_article → scraped URL</div>
							<div class="text-muted-foreground text-xs">
								2. summarize + extract_keywords (parallel)
							</div>
							<div class="text-muted-foreground text-xs">
								3. publish → waited for both to complete
							</div>
						</div>

						<div class="text-sm text-muted-foreground bg-accent/30 border border-border rounded p-3">
							<div class="font-semibold text-foreground mb-1">
								All workflow state lives in Postgres:
							</div>
							<div class="text-xs">• Query step outputs with SQL</div>
							<div class="text-xs">• Inspect retry history</div>
							<div class="text-xs">• Debug failures in your DB</div>
						</div>

						<div class="pt-3">
							<Button onclick={onDismiss} class="w-full cursor-pointer" size="lg"
								>Explore Step Details</Button
							>
						</div>

						<p class="text-xs text-muted-foreground text-center pt-2 border-t border-border">
							Click any step to see inputs, outputs, and execution data
						</p>
					</div>
				{/if}
			</CardContent>
		</Card>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fadeIn 0.2s ease-out;
	}

	.welcome-card {
		max-width: 550px;
		width: 90%;
		animation: slideIn 0.3s ease-out;
	}

	.exploration-guide {
		background: rgba(88, 166, 255, 0.05);
		border: 1px solid rgba(88, 166, 255, 0.2);
		border-radius: 6px;
		padding: 1rem;
		margin-top: 1rem;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(-20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
