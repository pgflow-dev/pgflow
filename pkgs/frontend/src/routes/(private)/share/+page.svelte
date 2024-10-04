<script lang="ts">
	import { enhance } from '$app/forms';

	export let form;
</script>

{#if form && form.data}
	<h1>Shared Content</h1>
	<p>URL: {form?.data?.url}</p>
	<p>Title: {form?.data.title}</p>
	<p>Text: {form?.data.text}</p>
{/if}

<form method="POST" use:enhance enctype="multipart/form-data">
	<input name="title" type="text" placeholder="Title" />
	<input name="text" type="text" placeholder="Text" />
	<input name="url" type="url" placeholder="URL" />
	<input name="files" type="file" multiple />
	<button type="submit">Submit</button>
</form>
