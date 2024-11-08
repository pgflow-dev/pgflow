<script lang="ts">
	import {
		SvelteFlow,
		Controls,
		Background,
		BackgroundVariant,
		MiniMap,
		type Node,
		type Edge
	} from '@xyflow/svelte';
	import StepStateNode from './StepStateNode.svelte';
	import type { Writable } from 'svelte/store';
	import '@xyflow/svelte/dist/style.css';

	export let nodes: Writable<Node[]>;
	export let edges: Writable<Edge[]>;

	nodes.subscribe((n) => {
		console.log('nodes updated:', n);
	});

	const snapGrid: [number, number] = [25, 25];

	const nodeTypes = {
		step_state: StepStateNode
	};

	// Debug reactive statements to track data changes
	$: $nodes && console.log('nodes updated:', $nodes);
</script>

<!--
👇 By default, the Svelte Flow container has a height of 100%.
This means that the parent container needs a height to render the flow.
-->
<div class="h-full">
	<SvelteFlow
		{nodes}
		{edges}
		{snapGrid}
		{nodeTypes}
		fitView
		colorMode="system"
		on:nodeclick={(event) => console.log('on node click', event.detail.node)}
	>
		<Controls />
		<Background variant={BackgroundVariant.Dots} />
		<MiniMap />
	</SvelteFlow>
</div>
