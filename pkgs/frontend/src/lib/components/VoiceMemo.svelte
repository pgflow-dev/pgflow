<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Recorder from '$components/Recorder.svelte';
	import SimpleUploader from '$components/SimpleUploader.svelte';
	import type { Session } from '@supabase/supabase-js';

	export let session: Session;

	let blob: Blob | null;
	$: console.log('blob bbbbbb', blob);

	const dispatch = createEventDispatcher();

	function onUploadComplete(e: CustomEvent) {
		dispatch('uploadComplete', e.detail);
		blob = null;
	}
</script>

{#if blob}
	<SimpleUploader
		{session}
		bucketName="feed_recordings"
		file={blob}
		on:uploadComplete={onUploadComplete}
	/>
{:else}
	<Recorder on:finished={(r) => (blob = r.detail.audioBlob)} />
{/if}
