<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Spinner from '$components/Spinner.svelte';
	import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
	import { onMount } from 'svelte';
	import { v4 as uuidv4 } from 'uuid';
	import Uppy, { type Meta, type UppyFile } from '@uppy/core';
	// import DragDrop from '@uppy/drag-drop';
	// import ProgressBar from '@uppy/progress-bar';
	import Tus from '@uppy/tus';
	import { writable } from 'svelte/store';
	import type { Session } from '@supabase/supabase-js';

	export let session: Session;
	export let bucketName: string;
	export let file: Blob; // Add this prop to receive the blob

	const dispatch = createEventDispatcher();

	const fileToUpload = writable<UppyFile<Meta, Record<string, never>>>();
	const supabaseStorageURL = `${PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`;

	onMount(() => {
		uppy = new Uppy();

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
				bucketName: bucketName,
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
			dispatch('uploadComplete', {
				file,
				result
			});
		});

		// Add the file to Uppy as soon as the component mounts
		if (file) {
			const uuid = uuidv4();
			uppy.addFile({
				name: `recording-${uuid}.webm`, // UUID-based name for blob
				type: file.type || 'audio/webm', // Default type if not specified
				data: file,
				source: 'Local',
				isRemote: false
			});
		}
	});
	var uppy = new Uppy();
</script>

<Spinner />
