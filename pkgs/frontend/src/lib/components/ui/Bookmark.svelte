<script lang="ts">
	export let title: string;
	export let url: string;

	function getFaviconUrl(url: string): string {
		const domain = new URL(url).hostname;
		return `https://www.google.com/s2/favicons?domain=${domain}`;
	}
</script>

<div class="card break-inside-avoid p-2 bg-gray-200 flex items-center">
	<img src={getFaviconUrl(url)} alt="Favicon" class="w-4 h-4 mr-2" />
	<a href={url} target="_blank" rel="noreferrer">{title}</a>
</div>
