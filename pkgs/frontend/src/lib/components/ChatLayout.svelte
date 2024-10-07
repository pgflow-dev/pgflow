<script lang="ts">
	import { scrollToBottom } from '$lib/actions';
	import { writable, get } from 'svelte/store';

	const messagesContainer = writable<HTMLElement | null>(null);

	const scroller = () => {
		const node = get(messagesContainer);

		if (node) {
			scrollToBottom(node);
		}

		return {
			update: scroller
		};
	};
</script>

<div class="flex flex-col h-screen">
	<div id="messages" bind:this={$messagesContainer} class="flex-grow overflow-y-auto">
		<slot name="messages" scrollToBottom={scroller} />
	</div>
	<div id="prompt" class="flex-shrink-0">
		<slot name="prompt" />
	</div>
</div>
