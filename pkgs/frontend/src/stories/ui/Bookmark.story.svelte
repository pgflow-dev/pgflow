<script lang="ts">
	import type { Hst as HstType } from '@histoire/plugin-svelte';
	import Bookmark from '$components/ui/Bookmark.svelte';

	export let Hst: HstType;

	let title = 'Hacker News | ycombinator';
	let url = 'https://news.ycombinator.com/';
</script>

<Hst.Story title="ui.Bookmark" layout={{ type: 'single', iframe: true }}>
	<Hst.Variant title="Default">
		<div class="columns-2 gap-2 space-y-2">
			<Bookmark bind:title bind:url />
			<Bookmark bind:title bind:url />
			<Bookmark bind:title bind:url />
			<Bookmark bind:title bind:url />
			<Bookmark bind:title bind:url />
			<Bookmark bind:title bind:url />
		</div>

		<svelte:fragment slot="controls">
			<Hst.Text title="Title" bind:value={title} />
			<Hst.Text title="URL" bind:value={url} />
		</svelte:fragment>
	</Hst.Variant>
</Hst.Story>
