<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		visible: boolean;
		onRunFlow: () => void;
		onDismiss: () => void;
	}

	let { visible, onRunFlow, onDismiss }: Props = $props();

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
				<div class="flex flex-col items-center gap-3 mb-6">
					<img src="/pgflow-logo-dark.svg" alt="pgflow" class="h-16" />
					<h1 class="text-xl text-center font-semibold">
						Workflow orchestration that runs in your Supabase project
					</h1>
				</div>
			</div>

			<div class="welcome-body">
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
