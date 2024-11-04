<script lang="ts">
	import ChatLayout from '$components/feed/ChatLayout.svelte';
	import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
	import { onMount } from 'svelte';
	import Uppy, { type Meta, type UppyFile } from '@uppy/core';
	import DragDrop from '@uppy/drag-drop';
	import ProgressBar from '@uppy/progress-bar';
	import Tus from '@uppy/tus';
	import { writable } from 'svelte/store';

	export let data;
	let { session } = data;
	$: ({ session } = data);

	const STORAGE_BUCKET = 'spike_uploads';

	// let uppy: Uppy;
	let dragDropElement: HTMLDivElement;
	let progressBarElement: HTMLDivElement;

	const fileToUpload = writable<UppyFile<Meta, Record<string, never>>>();
	const supabaseStorageURL = `${PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`;

	onMount(() => {
		uppy = new Uppy()
			.use(DragDrop, {
				target: dragDropElement
			})
			.use(ProgressBar, {
				target: progressBarElement
			});
		uppy.use(Tus, {
			endpoint: supabaseStorageURL,
			headers: {
				authorization: `Bearer ${session?.access_token}`,
				apikey: PUBLIC_SUPABASE_ANON_KEY
			},
			uploadDataDuringCreation: true,
			chunkSize: 6 * 1024 * 1024,
			allowedMetaFields: ['bucketName', 'objectName', 'contentType', 'cacheControl'],
			onError: function (error) {
				console.log('Failed because: ' + error);
			}
		});
		uppy.on('file-added', (file) => {
			fileToUpload.set(file);

			const supabaseMetadata = {
				bucketName: STORAGE_BUCKET,
				objectName: file.name,
				contentType: file.type
			};

			file.meta = {
				...file.meta,
				...supabaseMetadata
			};

			console.log('file added', file);

			uppy.upload();
		});

		uppy.on('complete', (result) => {
			console.log('Upload complete! We’ve uploaded these files:', result.successful);
		});
	});
	var uppy = new Uppy();
</script>

<ChatLayout>
	<main class="h-screen flex flex-col">
		<div class="flex-grow" />
		<div bind:this={dragDropElement} class="lg:mx-auto lg:w-1/2" />
		<div bind:this={progressBarElement} class="h+48" />
		<!-- {#if $fileToUpload} -->
		<!-- 	<pre class="w-1/3 font-mono text-sm mx-auto"> -->
		<!-- 		<code> -->
		<!-- 			{JSON.stringify($fileToUpload, null, 2)} -->
		<!-- 		</code> -->
		<!-- 	</pre> -->
		<!-- {/if} -->
		<div class="flex-grow" />
	</main>

	<div slot="footer" />
</ChatLayout>
