<script lang="ts">
	import Tags from '$components/Tags.svelte';
	import type { Bookmark } from '$lib/db/feed';

	export let bookmark: Bookmark;

	function getFaviconUrl(url: string): string {
		try {
			const domain = new URL(url).hostname;
			return `https://www.google.com/s2/favicons?domain=${domain}`;
		} catch {
			// return some generic favicon used in place of sites without favicon.
			return 'https://www.google.com/s2/favicons?domain=example.com';
		}
	}
</script>

<div class="break-inside-avoid p-2 flex items-center border border-gray-600 relative">
	<img src={getFaviconUrl(bookmark.url)} alt="Favicon" class="w-4 h-4 mr-2" />
	<a href={bookmark.url} target="_blank" rel="noreferrer">{bookmark.title}</a>
	<Tags className={'right-1 absolute'} tags={bookmark.tags || []} />
</div>
