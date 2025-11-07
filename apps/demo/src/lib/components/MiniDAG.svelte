<script lang="ts">
	/**
	 * Minimal DAG visualization for showing flow context
	 * Based on SVGDAGAnimation.astro approach
	 * Non-interactive, just shows structure and highlights current step
	 */
	interface Props {
		selectedStep: string | null;
	}

	let { selectedStep }: Props = $props();

	// Node dimensions (smaller for mini view)
	const nodeWidth = 60;
	const nodeHeight = 20;

	// Define nodes positions (x,y = center of node) - vertical layout
	const nodes = [
		{ id: 'fetch_article', x: 60, y: 20, label: 'fetch' },
		{ id: 'summarize', x: 25, y: 60, label: 'summ' },
		{ id: 'extract_keywords', x: 95, y: 60, label: 'kwrds' },
		{ id: 'publish', x: 60, y: 100, label: 'pub' }
	];

	// Define edges
	const edges = [
		{ from: 'fetch_article', to: 'summarize' },
		{ from: 'fetch_article', to: 'extract_keywords' },
		{ from: 'summarize', to: 'publish' },
		{ from: 'extract_keywords', to: 'publish' }
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
		return nodeId === selectedStep ? 'node selected' : 'node';
	}
</script>

<svg viewBox="0 0 120 120" class="mini-dag" xmlns="http://www.w3.org/2000/svg">
	<!-- Edges -->
	{#each edgePaths as edge}
		{#if edge}
			<path class="edge" d={edge.d} />
		{/if}
	{/each}

	<!-- Nodes -->
	{#each nodes as node}
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
		fill: #3d524d;
		stroke: #607b75;
		stroke-width: 1.5;
		transition: fill 0.2s ease, stroke 0.2s ease;
	}

	.node.selected rect {
		fill: #3b5bdb;
		stroke: #5b8def;
		stroke-width: 2;
	}

	.node text {
		fill: white;
		font-size: 10px;
		font-weight: 600;
		text-anchor: middle;
		dominant-baseline: middle;
		pointer-events: none;
	}
</style>
