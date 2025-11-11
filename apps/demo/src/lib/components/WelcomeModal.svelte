<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';

	interface Props {
		visible: boolean;
		hasRun: boolean;
		onRunFlow: () => void;
		onDismiss: () => void;
	}

	let { visible, hasRun, onRunFlow, onDismiss }: Props = $props();
</script>

{#if visible}
	<div class="modal-overlay">
		<Card class="welcome-card">
			<CardHeader class="pb-3">
				{#if !hasRun}
					<div class="flex flex-col items-center gap-3">
						<img src="/pgflow-logo-dark.svg" alt="pgflow" class="h-20" />
						<CardTitle class="text-2xl text-center">Welcome to pgflow Demo</CardTitle>
					</div>
				{:else}
					<CardTitle class="text-2xl text-center">Flow Completed! 🎉</CardTitle>
				{/if}
			</CardHeader>
			<CardContent class="space-y-4">
				{#if !hasRun}
					<!-- First-time welcome -->
					<div class="text-center space-y-4">
						<p class="text-lg text-muted-foreground">
							See a workflow in action - process an article with parallel steps
						</p>
						<div class="py-4">
							<Button onclick={onRunFlow} size="lg" class="text-lg px-8 py-6">
								Run the Flow
							</Button>
						</div>
						<p class="text-sm text-muted-foreground">
							Watch as the flow fetches an article, then summarizes and extracts keywords in
							parallel
						</p>
					</div>
				{:else}
					<!-- Post-run explanation -->
					<div class="space-y-4">
						<p class="text-base">
							The flow just processed an article through multiple steps:
						</p>
						<ul class="space-y-2 text-sm text-muted-foreground">
							<li>
								<strong class="text-foreground">Fetched</strong> the article content
							</li>
							<li>
								<strong class="text-foreground">Summarized</strong> and
								<strong class="text-foreground">extracted keywords</strong> in parallel
							</li>
							<li><strong class="text-foreground">Published</strong> the results</li>
						</ul>

						<div class="exploration-guide">
							<p class="text-base font-semibold mb-2">Try clicking on:</p>
							<ul class="space-y-2 text-sm text-muted-foreground">
								<li>👆 <strong class="text-foreground">Steps in the DAG</strong> to see their code and details</li>
								<li>👆 <strong class="text-foreground">Code blocks</strong> to highlight specific steps</li>
								<li>👆 <strong class="text-foreground">Events in the stream</strong> to see execution data</li>
							</ul>
						</div>

						<div class="pt-4">
							<Button onclick={onDismiss} class="w-full" size="lg">Start Exploring</Button>
						</div>
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
