<script lang="ts">
	import { scrollToBottom } from '$lib/actions';
	import { writable, get } from 'svelte/store';

	const messagesContainer = writable<HTMLElement | null>(null);

	const scroller = () => {
		const node = get(messagesContainer);
		console.log({ node });

		if (node) {
			scrollToBottom(node);
		}

		return {
			update: scroller
		};
	};
</script>

<div id="messages" bind:this={$messagesContainer} class="overflow-y-auto px-24 flex-grow">
	<slot name="messages" scrollToBottom={scroller} />
</div>
<div id="prompt" class="px-24 flex-shrink">
	<slot name="prompt" />
</div>
