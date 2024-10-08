<script lang="ts">
	import { enhance } from '$app/forms';

	export let data;
</script>

x
<pre><code>{JSON.stringify(data, null, 2)}</code></pre>
y

<form method="POST" use:enhance enctype="multipart/form-data">
	<input name="title" type="text" placeholder="Title" />
	<input name="text" type="text" placeholder="Text" />
	<input name="url" type="url" placeholder="URL" />
	<input name="files" type="file" multiple />
	<button type="submit">Submit</button>
</form>
