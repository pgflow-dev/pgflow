<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { SvelteFlow } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import type { createFlowState } from '$lib/stores/pgflow-state-improved.svelte';

	interface Props {
		flowState: ReturnType<typeof createFlowState>;
		selectedStep?: string | null;
		hoveredStep?: string | null;
	}

	let { flowState, selectedStep = null, hoveredStep = null }: Props = $props();

	let containerElement: HTMLDivElement | undefined = $state(undefined);
	let shouldFitView = $state(true);

	// Re-center when container or window resizes
	onMount(() => {
		const handleResize = () => {
			// Trigger fitView by toggling the flag
			shouldFitView = false;
			setTimeout(() => {
				shouldFitView = true;
			}, 0);
		};

		// Watch for window resizes
		window.addEventListener('resize', handleResize);

		// Watch for container size changes (e.g., when Shiki loads)
		let resizeObserver: ResizeObserver | undefined;
		if (containerElement) {
			resizeObserver = new ResizeObserver(() => {
				handleResize();
			});
			resizeObserver.observe(containerElement);
		}

		return () => {
			window.removeEventListener('resize', handleResize);
			if (resizeObserver && containerElement) {
				resizeObserver.unobserve(containerElement);
				resizeObserver.disconnect();
			}
		};
	});

	const dispatch = createEventDispatcher<{
		'step-selected': { stepSlug: string };
		'step-hovered': { stepSlug: string | null };
	}>();

	function handleNodeClick(event: any) {
		// Svelte Flow may pass event differently depending on version
		const node = event.detail?.node || event.node || event;
		const stepSlug = node.id;
		if (stepSlug) {
			// Clear hover state before navigating
			dispatch('step-hovered', { stepSlug: null });
			dispatch('step-selected', { stepSlug });
		}
	}

	function handleNodePointerEnter({ node }: { node: any; event: PointerEvent }) {
		const stepSlug = node.id;
		console.log('DAG node pointerenter:', stepSlug);
		if (stepSlug) {
			dispatch('step-hovered', { stepSlug });
		}
	}

	function handleNodePointerLeave({ node }: { node: any; event: PointerEvent }) {
		const stepSlug = node.id;
		console.log('DAG node pointerleave:', stepSlug);
		dispatch('step-hovered', { stepSlug: null });
	}

	// Define the 4-step DAG structure - reactive to step states and selection
	// Vertical spacing between nodes (81px between levels)
	// Shifted up by 30px to center better in viewport
	let nodes = $derived([
		{
			id: 'fetch_article',
			type: 'default',
			position: { x: 150, y: -30 },
			data: { label: 'fetch_article' },
			class: getNodeClass('fetch_article'),
			draggable: false
		},
		{
			id: 'summarize',
			type: 'default',
			position: { x: 50, y: 51 },
			data: { label: 'summarize' },
			class: getNodeClass('summarize'),
			draggable: false
		},
		{
			id: 'extract_keywords',
			type: 'default',
			position: { x: 250, y: 51 },
			data: { label: 'extract_keywords' },
			class: getNodeClass('extract_keywords'),
			draggable: false
		},
		{
			id: 'publish',
			type: 'default',
			position: { x: 150, y: 132 },
			data: { label: 'publish' },
			class: getNodeClass('publish'),
			draggable: false
		}
	]);

	let edges = $derived.by(() => [
		{
			id: 'e1',
			source: 'fetch_article',
			target: 'summarize',
			animated: isEdgeActive('fetch_article', 'summarize'),
			class: getEdgeClass('fetch_article', 'summarize')
		},
		{
			id: 'e2',
			source: 'fetch_article',
			target: 'extract_keywords',
			animated: isEdgeActive('fetch_article', 'extract_keywords'),
			class: getEdgeClass('fetch_article', 'extract_keywords')
		},
		{
			id: 'e3',
			source: 'summarize',
			target: 'publish',
			animated: isEdgeActive('summarize', 'publish'),
			class: getEdgeClass('summarize', 'publish')
		},
		{
			id: 'e4',
			source: 'extract_keywords',
			target: 'publish',
			animated: isEdgeActive('extract_keywords', 'publish'),
			class: getEdgeClass('extract_keywords', 'publish')
		}
	]);

	function isStepActive(stepSlug: string): boolean {
		const status = flowState.stepStatuses[stepSlug];
		return status === 'started';
	}

	function isStepCompleted(stepSlug: string): boolean {
		return flowState.stepStatuses[stepSlug] === 'completed';
	}

	function isStepFailed(stepSlug: string): boolean {
		return flowState.stepStatuses[stepSlug] === 'failed';
	}

	function isEdgeActive(source: string, target: string): boolean {
		// Edge is active (animated) when source is completed but target is not yet completed
		return isStepCompleted(source) && !isStepCompleted(target);
	}

	function getEdgeClass(source: string, target: string): string {
		const sourceCompleted = isStepCompleted(source);
		const targetCompleted = isStepCompleted(target);

		if (sourceCompleted && targetCompleted) {
			return 'edge-complete';
		} else if (sourceCompleted) {
			return 'edge-active';
		}
		return '';
	}

	function getNodeClass(stepSlug: string): string {
		const classes = ['dag-node'];

		if (isStepActive(stepSlug)) {
			classes.push('node-active');
		} else if (isStepCompleted(stepSlug)) {
			classes.push('node-completed');
		} else if (isStepFailed(stepSlug)) {
			classes.push('node-failed');
		} else {
			classes.push('node-created');
		}

		// Dimming: dim nodes that aren't selected when something is selected
		if (selectedStep && stepSlug !== selectedStep) {
			classes.push('node-dimmed');
		}

		// Add selected class if this step is selected
		if (selectedStep === stepSlug) {
			classes.push('node-selected');
		}

		// Add hovered class if this step is hovered (glow/outline)
		if (hoveredStep === stepSlug) {
			classes.push('node-hovered');
		}

		return classes.join(' ');
	}

</script>

<div class="dag-container dark" bind:this={containerElement}>
	{#key shouldFitView}
		<SvelteFlow
			{nodes}
			{edges}
			fitView={shouldFitView}
			fitViewOptions={{ padding: 0.1 }}
			panOnDrag={false}
			zoomOnScroll={false}
			zoomOnPinch={false}
			zoomOnDoubleClick={false}
			nodesDraggable={false}
			nodesConnectable={false}
			elementsSelectable={true}
			onnodeclick={handleNodeClick}
			onnodepointerenter={handleNodePointerEnter}
			onnodepointerleave={handleNodePointerLeave}
		>
		</SvelteFlow>
	{/key}
</div>

<style>
	.dag-container {
		width: 100%;
		height: 100%;
		border-radius: 4px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	/* Ensure SvelteFlow fills container */
	.dag-container :global(.svelte-flow) {
		flex: 1;
	}

	/* Hide connection handles */
	:global(.svelte-flow__handle) {
		opacity: 0;
		pointer-events: none;
	}

	/* Node styles matching website SVG DAG */
	:global(.dag-node) {
		border-radius: 4px;
		padding: 8px 16px;
		font-size: 14px;
		font-weight: 600;
		color: white;
		transition: background 0.3s ease, border 0.3s ease, opacity 200ms ease;
		filter: drop-shadow(3px 4px 4px rgba(0, 0, 0, 0.25));
	}

	:global(.node-created) {
		background: #3d524d;
		border: 2.5px solid #607b75;
	}

	:global(.node-active) {
		background: #3b5bdb;
		border: 2.5px solid #5b8def;
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	:global(.node-completed) {
		background: #177a51;
		border: 2.5px solid #20a56f;
	}

	:global(.node-failed) {
		background: #c94a2e;
		border: 2.5px solid #f08060;
	}

	/* Dimmed nodes (when selecting another node) */
	:global(.dag-node.node-dimmed) {
		opacity: 0.3;
	}

	/* Hovered node - blue glow/outline */
	:global(.dag-node.node-hovered) {
		outline: 3px solid rgba(88, 166, 255, 0.8) !important;
		outline-offset: 2px !important;
		box-shadow: 0 0 20px rgba(88, 166, 255, 0.4) !important;
		cursor: pointer !important;
	}

	/* Selected node - blue outline with glow, stays after click */
	:global(.dag-node.node-selected) {
		outline: 3px solid rgba(88, 166, 255, 0.8) !important;
		outline-offset: 2px !important;
		box-shadow: 0 0 20px rgba(88, 166, 255, 0.4) !important;
		cursor: pointer !important;
	}

	@keyframes pulse {
		0%,
		100% {
			box-shadow: 0 0 0 0 rgba(59, 91, 219, 0.7);
		}
		50% {
			box-shadow: 0 0 0 8px rgba(59, 91, 219, 0);
		}
	}

	/* Svelte Flow dark mode styling */
	:global(.dag-container.dark .svelte-flow) {
		background: #182b28;
	}

	/* Edge styles matching website */
	:global(.dag-container.dark .svelte-flow__edge path) {
		stroke: #607b75;
		stroke-width: 2.5;
		fill: none;
		opacity: 0.6;
		stroke-dasharray: 8 4;
	}

	/* Active edge - source completed, animating toward target */
	:global(.dag-container.dark .svelte-flow__edge.edge-active path) {
		stroke: #6b8c85;
		stroke-width: 3;
		opacity: 0.9;
		stroke-dasharray: 8 4;
	}

	/* Animated state from Svelte Flow */
	:global(.dag-container.dark .svelte-flow__edge.animated path) {
		animation: dash-flow 1s linear infinite;
	}

	/* Complete edge - both source and target completed */
	:global(.dag-container.dark .svelte-flow__edge.edge-complete path) {
		stroke: #1a9c64;
		stroke-width: 2.5;
		opacity: 0.9;
		stroke-dasharray: none;
		animation: none;
	}

	@keyframes dash-flow {
		to {
			stroke-dashoffset: -12;
		}
	}

	/* Svelte Flow attribution styling */
	:global(.dag-container .svelte-flow__attribution) {
		background: rgba(42, 61, 57, 0.8);
		padding: 2px 6px;
		border-radius: 3px;
		font-size: 9px;
		color: #92a8a3;
		opacity: 0.6;
	}

	:global(.dag-container .svelte-flow__attribution a) {
		color: #a3d4cb;
		text-decoration: none;
	}

	:global(.dag-container .svelte-flow__attribution a:hover) {
		color: #007b6e;
	}
</style>
