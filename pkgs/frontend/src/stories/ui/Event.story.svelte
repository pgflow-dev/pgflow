<script lang="ts">
	import type { Hst as HstType } from '@histoire/plugin-svelte';
	import Event from '$components/ui/Event.svelte';

	export let Hst: HstType;

	let title = 'Dentist appointment';
	let description = 'Just a small check, nothing serious. Remember to take the toothbrush tho!';
	let datetime = new Date().toISOString();
	let place = '4th floor, New York, NY 10001';
</script>

<Hst.Story title="ui.Event" layout={{ type: 'single', iframe: true }}>
	<Hst.Variant title="Default">
		<div class="columns-2 gap-2 space-y-2">
			<Event bind:title bind:description bind:datetime bind:place />
		</div>

		<svelte:fragment slot="controls">
			<Hst.Text title="Title" bind:value={title} />
			<Hst.Textarea title="Description" bind:value={description} />
			<!-- <Hst. title="Date" bind:value={datetime} /> -->
			<Hst.Text title="Place" bind:value={place} />
		</svelte:fragment>
	</Hst.Variant>
</Hst.Story>
