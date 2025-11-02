<script lang="ts">
	import { onDestroy } from 'svelte';
	import { pgflow } from '$lib/supabase';
	import { createFlowState } from '$lib/stores/pgflow-state-improved.svelte';
	import DAGVisualization from '$lib/components/DAGVisualization.svelte';
	import DebugPanel from '$lib/components/DebugPanel.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import type ArticleFlow from '../../supabase/functions/article_flow_worker/article_flow';

	const flowState = createFlowState<typeof ArticleFlow>(
		pgflow,
		'article_flow',
		['fetch_article', 'summarize', 'extract_keywords', 'publish']
	);

	let url = $state('https://enaix.github.io/2025/10/30/developer-verification.html');

	async function processArticle() {
		try {
			const run = await flowState.startFlow({ url });
			console.log('Flow started:', run);
			console.log('Step states:', run?.stepStates);
		} catch (error) {
			console.error('Failed to start flow:', error);
		}
	}

	// Automatic cleanup on unmount
	onDestroy(() => flowState.dispose());

	const isRunning = $derived(
		flowState.status === 'starting' ||
			flowState.status === 'started' ||
			flowState.status === 'in_progress'
	);
</script>

<div class="container mx-auto p-4 min-h-screen">
	<header class="mb-4">
		<h1 class="text-3xl font-bold mb-3">pgflow Demo - Phase 3: DAG + Debug</h1>
		<div class="flex gap-3 items-center mb-4">
			<Input
				type="url"
				bind:value={url}
				placeholder="Enter article URL"
				class="flex-1"
			/>
			<Button onclick={processArticle} disabled={isRunning}>
				Process Article
			</Button>
		</div>
	</header>

	<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
		<div class="flex flex-col">
			<Card>
				<CardHeader class="pb-3">
					<CardTitle class="text-sm">DAG Visualization</CardTitle>
				</CardHeader>
				<CardContent class="pt-0">
					<DAGVisualization {flowState} />
				</CardContent>
			</Card>
		</div>

		<div class="flex flex-col max-h-[calc(100vh-200px)]">
			<Card class="h-full flex flex-col">
				<CardContent class="flex-1 overflow-hidden py-4">
					<DebugPanel {flowState} />
				</CardContent>
			</Card>
		</div>
	</div>
</div>
