<script lang="ts">
	import type { Hst as HstType } from '@histoire/plugin-svelte';
	import { logEvent } from 'histoire/client';
	import Prompt from '$components/Prompt.svelte';

	export let Hst: HstType;

	let value = '';
	let placeholder = 'Enter a message';
	let loading = false;
	let label = 'Send';
</script>

<Hst.Story title="Prompt" layout={{ type: 'single', iframe: true }}>
	<Hst.Variant title="Default">
		<Prompt on:submit={(arg) => logEvent('Submit', arg)} {value} {placeholder} {loading} {label} />

		<svelte:fragment slot="controls">
			<Hst.Text title="Value" bind:value />
			<Hst.Text title="Placeholder" bind:value={placeholder} />
			<Hst.Checkbox title="In Progress" bind:value={loading} />
			<Hst.Text title="Label" bind:value={label} />
		</svelte:fragment>
	</Hst.Variant>
</Hst.Story>
