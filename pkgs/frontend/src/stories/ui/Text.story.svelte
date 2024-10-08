<script lang="ts">
	import type { Hst as HstType } from '@histoire/plugin-svelte';
	import Text from '$components/ui/Text.svelte';

	export let Hst: HstType;

	let text = `Lorem ipsum dolor sit amet,
consectetur adipiscing elit, sed do eiusmod tempor incididunt
ut labore et dolore magna aliqua. Ut enim ad minim veniam,
quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea
commodo consequat. Duis aute irure dolor in reprehenderit in
voluptate velit esse cillum dolore eu fugiat nulla pariatur.
Excepteur sint occaecat cupidatat non proident, sunt in culpa`;
</script>

<Hst.Story title="ui.Text" layout={{ type: 'single', iframe: true }}>
	<Hst.Variant title="Default">
		<div class="columns-2 gap-2 space-y-2">
			<Text bind:text />
			<Text bind:text />
			<Text bind:text />
			<Text bind:text />
			<Text bind:text />
			<Text bind:text />
		</div>

		<svelte:fragment slot="controls">
			<Hst.Text title="text" bind:value={text} />
		</svelte:fragment>
	</Hst.Variant>
</Hst.Story>
