<script lang="ts">
	import type { createFlowState } from '$lib/stores/pgflow-state.svelte';

	/**
	 * Minimal DAG visualization for showing flow context
	 * Based on SVGDAGAnimation.astro approach
	 * Non-interactive, just shows structure and highlights current step
	 */
	interface Props {
		selectedStep: string | null;
		flowState: ReturnType<typeof createFlowState>;
	}

	let { selectedStep, flowState }: Props = $props();

	function isStepActive(stepSlug: string): boolean {
		// Use reactive step() method from runState
		return flowState.step(stepSlug).status === 'started';
	}

	function isStepCompleted(stepSlug: string): boolean {
		// Use reactive step() method from runState
		return flowState.step(stepSlug).status === 'completed';
	}

	function isStepFailed(stepSlug: string): boolean {
		// Use reactive step() method from runState
		return flowState.step(stepSlug).status === 'failed';
	}

	// Node dimensions (smaller for mini view)
	const nodeWidth = 60;
	const nodeHeight = 20;

	// Define nodes positions (x,y = center of node) - vertical layout
	const nodes = [
		{ id: 'fetchArticle', x: 60, y: 20, label: 'fetch' },
		{ id: 'summarize', x: 25, y: 60, label: 'summ' },
		{ id: 'extractKeywords', x: 95, y: 60, label: 'kwrds' },
		{ id: 'publish', x: 60, y: 100, label: 'pub' }
	];

	// Define edges
	const edges = [
		{ from: 'fetchArticle', to: 'summarize' },
		{ from: 'fetchArticle', to: 'extractKeywords' },
		{ from: 'summarize', to: 'publish' },
		{ from: 'extractKeywords', to: 'publish' }
	];

	// Helper function to create smooth curved paths for vertical layout
	function createVerticalPath(x1: number, y1: number, x2: number, y2: number): string {
		const path = [];
		path.push(`M ${x1} ${y1}`); // Start

		// Calculate control points for smooth bezier curve
		const midY = (y1 + y2) / 2;

		// Control point 1: below start point
		const cp1x = x1;
		const cp1y = midY;

		// Control point 2: above end point
		const cp2x = x2;
		const cp2y = midY;

		// Cubic bezier curve
		path.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`);

		return path.join(' ');
	}

	// Generate edge paths
	const edgePaths = edges.map((edge) => {
		const fromNode = nodes.find((n) => n.id === edge.from);
		const toNode = nodes.find((n) => n.id === edge.to);

		if (!fromNode || !toNode) return null;

		// Start from bottom center of source node
		const x1 = fromNode.x;
		const y1 = fromNode.y + nodeHeight / 2;

		// End at top center of target node
		const x2 = toNode.x;
		const y2 = toNode.y - nodeHeight / 2;

		return {
			d: createVerticalPath(x1, y1, x2, y2),
			id: `${edge.from}-${edge.to}`
		};
	});

	function getNodeClass(nodeId: string): string {
		const classes = ['node'];

		if (isStepActive(nodeId)) {
			classes.push('node-active');
		} else if (isStepCompleted(nodeId)) {
			classes.push('node-completed');
		} else if (isStepFailed(nodeId)) {
			classes.push('node-failed');
		} else {
			classes.push('node-created');
		}

		if (nodeId === selectedStep) {
			classes.push('node-selected');
		}

		return classes.join(' ');
	}
</script>

<svg viewBox="-2 -2 124 134" class="mini-dag" xmlns="http://www.w3.org/2000/svg">
	<!-- Edges -->
	{#each edgePaths as edge (edge?.id)}
		{#if edge}
			<path class="edge" d={edge.d} />
		{/if}
	{/each}

	<!-- Nodes -->
	{#each nodes as node (node.id)}
		<g class={getNodeClass(node.id)}>
			<rect
				x={node.x - nodeWidth / 2}
				y={node.y - nodeHeight / 2}
				width={nodeWidth}
				height={nodeHeight}
				rx="2"
				ry="2"
			/>
			<text x={node.x} y={node.y}>{node.label}</text>
		</g>
	{/each}
</svg>

<style>
	.mini-dag {
		width: 100%;
		height: 100%;
		display: block;
	}

	.edge {
		stroke: #607b75;
		stroke-width: 1.5;
		fill: none;
		opacity: 0.5;
	}

	.node rect {
		transition:
			fill 0.3s ease,
			stroke 0.3s ease,
			stroke-width 0.3s ease;
	}

	/* Node state colors - matching main DAG */
	.node-created rect {
		fill: #3d524d;
		stroke: #607b75;
		stroke-width: 1.5;
	}

	.node-active rect {
		fill: #3b5bdb;
		stroke: #5b8def;
		stroke-width: 1.5;
	}

	.node-completed rect {
		fill: #177a51;
		stroke: #20a56f;
		stroke-width: 1.5;
	}

	.node-failed rect {
		fill: #c94a2e;
		stroke: #f08060;
		stroke-width: 1.5;
	}

	/* Selected node - thick blue outline */
	.node-selected rect {
		stroke: rgba(88, 166, 255, 0.9);
		stroke-width: 3;
	}

	.node text {
		fill: white;
		font-size: 11px;
		font-weight: 400;
		text-anchor: middle;
		dominant-baseline: middle;
		pointer-events: none;
	}
</style>
