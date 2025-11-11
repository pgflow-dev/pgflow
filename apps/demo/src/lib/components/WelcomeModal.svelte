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
						<p class="text-sm text-muted-foreground">
							This demo is a 4-step DAG workflow: fetch → (summarize + extract_keywords in parallel) → publish.
							Watch how pgflow orchestrates execution across three layers.
						</p>

						<!-- Three-layer architecture -->
						<div class="text-sm space-y-2 bg-secondary/30 border border-border rounded p-3">
							<div class="font-semibold text-foreground mb-1">Three-layer architecture:</div>
							<div class="text-xs text-muted-foreground">
								<span class="font-mono text-foreground">DSL</span> - User intent (compiles to graph shape in database tables)
							</div>
							<div class="text-xs text-muted-foreground">
								<span class="font-mono text-foreground">SQL Core</span> - Workflow orchestration (dependency resolution, queue management)
							</div>
							<div class="text-xs text-muted-foreground">
								<span class="font-mono text-foreground">Worker</span> - Dumb execution (polls queue, runs handlers, reports completion)
							</div>
						</div>

						<!-- What powers this demo -->
						<div class="text-xs text-muted-foreground bg-accent/30 border border-border rounded p-3">
							<div class="font-semibold text-foreground mb-1.5">
								Demo powered by pgflow TypeScript Client:
							</div>
							<div>• Supabase RPC to start flows</div>
							<div>• Supabase Realtime to stream graph state changes</div>
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
							Click any step to inspect inputs, outputs, and dependencies
						</p>
					</div>
				{:else}
					<!-- Post-run explanation -->
					<div class="space-y-3">
						<div class="bg-accent/30 rounded-lg p-3 border border-accent">
							<div class="font-semibold text-foreground mb-2">What just happened:</div>
							<div class="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
								<div>
									<span class="font-mono text-foreground">start_flow()</span> created state rows for each step
								</div>
								<div>
									SQL Core pushed <span class="font-mono text-foreground">fetch_article</span> message to queue
								</div>
								<div>
									Worker polled queue, executed handler, called <span class="font-mono text-foreground">complete_task()</span>
								</div>
								<div>
									SQL Core acknowledged completion, saved output, found 2 steps with all dependencies met
								</div>
								<div>
									Both started in parallel → after completion, <span class="font-mono text-foreground">publish</span> became ready
								</div>
								<div>
									Final step completed → SQL Core marked run as completed
								</div>
							</div>
						</div>

						<!-- Key concept: dependency resolution -->
						<div class="text-sm text-muted-foreground bg-secondary/30 border border-border rounded p-3">
							<div class="font-semibold text-foreground mb-1.5">
								Dependency resolution:
							</div>
							<div class="text-xs leading-relaxed">
								After each <code class="bg-muted px-1 rounded">complete_task()</code>, SQL Core searches for
								dependent steps with <strong>all dependencies satisfied</strong>. Ready steps get messages
								pushed to the queue. The run completes when no steps remain.
							</div>
						</div>

						<!-- Realtime updates -->
						<div class="text-xs text-muted-foreground bg-accent/30 border border-border rounded p-2.5">
							<div class="font-semibold text-foreground mb-1">
								🔄 Live updates via Supabase Realtime
							</div>
							<div>
								SQL Core broadcasts graph state changes (step:started, step:completed, run:completed) that
								update this demo in real-time.
							</div>
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
