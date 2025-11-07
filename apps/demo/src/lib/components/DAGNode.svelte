<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import PulseDot from './PulseDot.svelte';

	interface Props {
		data: { label: string };
	}

	let { data }: Props = $props();
</script>

<div class="dag-node-content">
	<PulseDot />
	{data.label}
	<Handle type="target" position={Position.Top} />
	<Handle type="source" position={Position.Bottom} />
</div>

<style>
	.dag-node-content {
		position: relative;
		padding: 6px;
		font-size: 14px;
		text-align: center;
		min-width: 120px;
		width: 120px;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
