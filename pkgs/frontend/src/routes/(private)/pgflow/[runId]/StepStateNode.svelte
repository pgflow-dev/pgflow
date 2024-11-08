<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';

	type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

	type StepState = {
		run_id: string;
		status: string;
		step_result:
			| string
			| number
			| boolean
			| Json[]
			| {
					[x: string]: Json;
			  }
			| null;
		step_slug: string;
		flow_slug: string;
	};

	type Step = {
		step_slug: string;
		flow_slug: string;
	};

	interface NodeData extends Record<string, unknown> {
		step: Step;
		label: string;
		step_state?: StepState;
	}

	type $$Props = NodeProps & {
		data: NodeData;
	};
	export let data: NodeData;

	const statusToIconClass: Record<string, string> = {
		pending: 'text-yellow-500',
		completed: 'text-green-500',
		failed: 'text-red-500'
	};
	const statusToBorderClass: Record<string, string> = {
		pending: 'border-yellow-500',
		completed: 'border-green-500',
		failed: 'border-red-500'
	};
	const statusToBackgroundClass: Record<string, string> = {
		pending: 'bg-yellow-950',
		completed: 'bg-green-950',
		failed: 'bg-red-950/30'
	};
	const statusToOpacityClass: Record<string, string> = {
		pending: 'opacity-100',
		completed: 'opacity-100',
		failed: 'opacity-100'
	};
	let borderClass: string;
	let backgroundClass: string;
	let opacityClass: string;
	$: status = data.step_state?.status;
	$: {
		if (status) {
			borderClass = statusToBorderClass[status];
			backgroundClass = statusToBackgroundClass[status];
			opacityClass = statusToOpacityClass[status];
		} else {
			borderClass = 'border-stone-400/20';
			backgroundClass = 'bg-stone-950/20';
			opacityClass = 'opacity-100';
		}
	}
	<$$Props>$$restProps;

	import { Card } from '$components/ui/card';
	import Spinner from '$components/Spinner.svelte';
	import { Skull, Check, Hourglass } from 'lucide-svelte';
</script>

<Card class="p-4 {backgroundClass} {borderClass} {opacityClass}">
	<div class="flex items-center justify-center">
		<div class="text-lg font-bold mr-4">{data.step.step_slug}</div>
		{#if status === 'pending'}
			<Spinner className={statusToIconClass[status]} />
		{:else if status === 'failed'}
			<Skull class={statusToIconClass[status]} />
		{:else if status === 'completed'}
			<Check class={statusToIconClass[status]} />
		{:else}
			<Hourglass class="text-gray-500" />
		{/if}
	</div>

	<Handle type="target" position={Position.Top} />
	<Handle type="source" position={Position.Bottom} />
</Card>
