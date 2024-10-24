<script lang="ts">
	import type { Hst as HstType } from '@histoire/plugin-svelte';
	import BookmarkComponent from '$components/feed/BookmarkComponent.svelte';
	import type { Bookmark } from '$lib/db/feed';

	export let Hst: HstType;

	let title = 'Hacker News | ycombinator';
	let url = 'https://news.ycombinator.com/';

	// (alias) type Bookmark = {
	//     created_at: string;
	//     id: string;
	//     owner_id: string;
	//     reason: string | null;
	//     share_id: string;
	//     short_summary: string;
	//     tags: string[] | null;
	//     title: string;
	//     type: string;
	//     url: string;
	// } & {
	//     ...;
	// }
	const bookmark: Bookmark = {
		created_at: '2022-01-01T00:00:00.000Z',
		id: '1',
		owner_id: '1',
		reason: 'reason',
		share_id: '1',
		short_summary: 'short summary',
		tags: ['tag1', 'tag2'],
		title: title,
		type: 'bookmark',
		url: url
	};
</script>

<Hst.Story title="feed.Bookmark" layout={{ type: 'single', iframe: true }}>
	<Hst.Variant title="Default">
		<div class="columns-2 gap-2 space-y-2">
			<BookmarkComponent {bookmark} />
		</div>

		<svelte:fragment slot="controls">
			<Hst.Text title="Title" bind:value={title} />
			<Hst.Text title="URL" bind:value={url} />
		</svelte:fragment>
	</Hst.Variant>
</Hst.Story>
