<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	let mediaRecorder: MediaRecorder | null = null;
	let audioBlobs: Blob[] = [];
	let isRecording = false;
	let stream: MediaStream | null = null;
	async function startRecording() {
		try {
			console.log('Requesting microphone access...');
			stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
				video: false
			});
			console.log('Microphone access granted');

			mediaRecorder = new MediaRecorder(stream);
			console.log(
				'MediaRecorder created with settings:',
				mediaRecorder.audioBitsPerSecond,
				'bits/s'
			);

			mediaRecorder.ondataavailable = (event) => {
				console.log('Received audio chunk:', event.data.size, 'bytes');
				audioBlobs.push(event.data);
			};

			mediaRecorder.onstop = () => {
				console.log('Recording stopped, processing audio...');
				const audioBlob = new Blob(audioBlobs, { type: 'audio/wav' });
				console.log('Created final audio blob:', audioBlob.size, 'bytes');
				audioBlobs = [];

				// Clean up the stream
				if (stream) {
					stream.getTracks().forEach((track) => track.stop());
					stream = null;
				}

				dispatch('finished', { audioBlob });
			};

			audioBlobs = [];
			mediaRecorder.start();
			isRecording = true;
		} catch (error) {
			console.error('Error accessing microphone:', error);
			alert('Failed to access microphone. Please ensure you have granted permission.');
		}
	}

	function stopRecording() {
		console.log('stopRecording', { isRecording, mediaRecorder });
		if (mediaRecorder && mediaRecorder.state !== 'inactive') {
			mediaRecorder.stop();
			isRecording = false;
		}
	}
</script>

<button
	class="w-12 h-12 rounded-full bg-red-900 flex items-center justify-center transition-transform hover:scale-105 focus:outline-none"
	class:animate-pulse={isRecording}
	on:click={() => {
		if (isRecording) {
			stopRecording();
		} else {
			startRecording();
		}
	}}
	aria-label={isRecording ? 'Stop recording' : 'Start recording'}
>
	<div
		class="w-12 h-12 rounded-full border-4 border-red-600 flex items-center justify-center text-white font-semibold text-sm"
	>
		Rec
	</div>
</button>
