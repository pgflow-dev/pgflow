<script>
	import { page } from '$app/stores';

	let url = $page.url.searchParams.get('url') || '';
	let title = $page.url.searchParams.get('title') || '';
	let text = $page.url.searchParams.get('text') || '';
</script>

<h1>Shared Content</h1>
<p>URL: {url}</p>
<p>Title: {title}</p>
<p>Text: {text}</p>
