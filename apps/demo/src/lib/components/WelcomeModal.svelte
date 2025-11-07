<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';

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
	<div class="welcome-screen bg-background">
		<div class="welcome-content">
			<div class="welcome-header">
				{#if !hasRun}
					<div class="flex flex-col items-center gap-3 mb-6">
						<img src="/pgflow-logo-dark.svg" alt="pgflow" class="h-16" />
						<h1 class="text-xl text-center font-semibold">
							Workflow orchestration that runs in your Supabase project
						</h1>
					</div>
				{:else}
					<h1 class="text-xl text-center font-semibold mb-6">🎉 Workflow Complete</h1>
				{/if}
			</div>

			<div class="welcome-body">
				{#if !hasRun}
					<!-- First-time welcome -->
					<div class="space-y-5">
						<p class="text-base text-foreground leading-relaxed">
							This demo runs a 4-step DAG: <strong class="font-mono text-sm">fetch</strong> → (<strong
								class="font-mono text-sm">summarize</strong
							>
							+ <strong class="font-mono text-sm">extractKeywords</strong> in parallel) →
							<strong class="font-mono text-sm">publish</strong>.
						</p>

						<div class="space-y-2.5 text-sm text-foreground/90 leading-relaxed">
							<p>
								<strong>Postgres</strong> handles orchestration, state management, output persistence,
								retries, and queue management.
							</p>
							<p>
								<strong>Auto-respawning Edge Function worker</strong> executes your handlers.
							</p>
							<p>
								<strong>TypeScript Client</strong> wraps RPC and Realtime for starting flows and observing
								state changes.
							</p>
						</div>

						<div class="py-3 space-y-2">
							<Button onclick={onRunFlow} size="lg" class="w-full cursor-pointer">
								Run the Demo
							</Button>
							<button
								onclick={onDismiss}
								class="text-sm text-foreground/70 hover:text-foreground w-full cursor-pointer"
							>
								Explore code first
							</button>
						</div>

						<p class="text-sm text-foreground/70 text-center pt-2 border-t border-border">
							Click any step to inspect inputs, outputs, and dependencies
						</p>
					</div>
				{:else}
					<!-- Post-run explanation -->
					<div class="space-y-5">
						<p class="text-base text-foreground leading-relaxed">
							<strong>What happened:</strong>
						</p>

						<div class="space-y-2.5 text-sm text-foreground/90 leading-relaxed">
							<p>
								<strong class="font-mono text-sm">start_flow()</strong> created step state in Postgres
								and pushed messages to the queue.
							</p>
							<p>
								<strong>Edge Function worker</strong> polled queue, executed handlers, and reported back.
							</p>
							<p>
								<strong>SQL Core</strong> updated state, saved outputs, resolved dependencies, and scheduled
								next steps.
							</p>
							<p>
								<strong>Supabase Realtime</strong> broadcast each state change to update this UI in real-time.
							</p>
						</div>

						<p class="text-sm text-foreground/90 leading-relaxed">
							After each task completes, SQL Core finds steps with all dependencies met, pushes them
							to the queue, and marks the run complete when no steps remain.
						</p>

						<div class="py-3">
							<Button onclick={onDismiss} class="w-full cursor-pointer" size="lg"
								>Explore Step Details</Button
							>
						</div>

						<p class="text-sm text-foreground/70 text-center pt-2 border-t border-border">
							Click any step to see inputs, outputs, and execution data
						</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.welcome-screen {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 1000;
		overflow-y: auto;
		animation: fadeIn 0.2s ease-out;
	}

	.welcome-content {
		min-height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		max-width: 600px;
		margin: 0 auto;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
