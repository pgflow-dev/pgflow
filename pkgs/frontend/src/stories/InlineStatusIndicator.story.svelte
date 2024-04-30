<script lang="ts">
	import type { Hst as HstType } from '@histoire/plugin-svelte';
	import InlineStatusIndicator from '$components/InlineStatusIndicator.svelte';

	export let Hst: HstType;

	let loading = true;
	let label = 'Understanding question...';
</script>

<Hst.Story title="InlineStatusIndicator" layout={{ type: 'single', iframe: true }}>
	<Hst.Variant title="Default">
		<InlineStatusIndicator {loading} {label} />

		<svelte:fragment slot="controls">
			<Hst.Checkbox title="In Progress" bind:value={loading} />
			<Hst.Text title="Label" bind:value={label} />
		</svelte:fragment>
	</Hst.Variant>
</Hst.Story>
