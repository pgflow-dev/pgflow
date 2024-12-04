<script lang="ts">
	import { writable } from 'svelte/store';
	import { page } from '$app/stores';
	import FlowDag from './FlowDag.svelte';
	import { onDestroy, onMount } from 'svelte';
	import { type Node, type Edge } from '@xyflow/svelte';
	import getLayoutedElements from './getLayoutedElements';
	import fetchFlowRun from './fetchFlowRun';
	import type {
		REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
		RealtimeChannel
	} from '@supabase/supabase-js';
	import type { StepState, StepTask } from '$lib/db/pgflow';
	import type { PageData } from './$types';

	export let data: PageData;
	let { supabase } = data;
	$: ({ supabase } = data);

	$: runId = $page.params.runId;
	console.log('runId', runId);

	let realtimeChannel: RealtimeChannel;

	const nodes = writable<Node[]>([]);
	const edges = writable<Edge[]>([]);
	const initialNodes = writable<Node[]>([]);
	const initialEdges = writable<Edge[]>([]);

	$: {
		const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
			$initialNodes,
			$initialEdges
		);
		nodes.set(layoutedNodes);
		edges.set(layoutedEdges);
	}

	import type {
		RealtimePostgresChangesPayload,
		RealtimePostgresChangesFilter
	} from '@supabase/supabase-js';

	function updateStepState(payload: RealtimePostgresChangesPayload<StepState>) {
		if (payload.eventType === 'DELETE') {
			console.log('deleteStepState', payload);
		} else {
			console.log('updateStepState', payload);
			const { new: stepState } = payload;
			initialNodes.update((nodes) => updateNodeWithStepState(nodes, stepState));
		}
	}

	function updateStepTask(payload: RealtimePostgresChangesPayload<StepTask>) {
		if (payload.eventType === 'DELETE') {
			console.log('deleteStepTask', payload);
		} else {
			console.log('updateStepTask', payload);
			const { new: stepTask } = payload;
			initialNodes.update((nodes) => updateNodeWithStepTask(nodes, stepTask));
		}
	}

	function updateNodeWithStepTask(nodes: Node[], stepTask: StepTask) {
		return nodes.map((node) => {
			if (node.id === stepTask.step_slug) {
				return {
					...node,
					data: {
						...node.data,
						step_task: stepTask
					}
				};
			}
			return node;
		});
	}
	function updateNodeWithStepState(nodes: Node[], stepState: StepState) {
		return nodes.map((node) => {
			if (node.id === stepState.step_slug) {
				return {
					...node,
					data: {
						...node.data,
						step_state: stepState
					}
				};
			}
			return node;
		});
	}

	onMount(async () => {
		const flowRun = await fetchFlowRun(supabase, runId);
		const { nodes: newNodes, edges: newEdges } = flowRun;
		console.log('flowRun', flowRun);

		$initialNodes = newNodes;
		$initialEdges = newEdges;

		const eventSpec: RealtimePostgresChangesFilter<`${REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.ALL}`> =
			{
				schema: 'pgflow',
				event: '*',
				filter: `run_id=eq.${runId}`
			};
		console.log('eventSpec', eventSpec);

		realtimeChannel = supabase
			.channel('schema-db-changes')
			.on('postgres_changes', { ...eventSpec, table: 'step_states' }, updateStepState)
			.on('postgres_changes', { ...eventSpec, table: 'step_tasks' }, updateStepTask)
			.subscribe();
	});

	onDestroy(() => {
		if (realtimeChannel) {
			realtimeChannel.unsubscribe();
		}
	});
</script>

<FlowDag {nodes} {edges} />
