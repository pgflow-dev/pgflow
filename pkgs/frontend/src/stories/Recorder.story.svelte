<script lang="ts">
	import type { Hst as HstType } from '@histoire/plugin-svelte';
	import { logEvent } from 'histoire/client';

	import Recorder from '$components/Recorder.svelte';

	export let Hst: HstType;

	function handleFinished(event: Event) {
		logEvent('finished', event);
		console.log('finished', event);
	}
</script>

<Hst.Story title="Recorder" layout={{ type: 'single', iframe: true }}>
	<Hst.Variant title="Default">
		<div class="columns-2 gap-2 space-y-2">
			<Recorder on:finished={handleFinished} />
		</div>

		<!-- <svelte:fragment slot="controls"> -->
		<!-- 	<Hst.Text title="Title" bind:value={title} /> -->
		<!-- 	<Hst.Text title="URL" bind:value={url} /> -->
		<!-- </svelte:fragment> -->
	</Hst.Variant>
</Hst.Story>
