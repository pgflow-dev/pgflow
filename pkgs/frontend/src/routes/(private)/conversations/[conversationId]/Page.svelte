<script lang="ts">
	import ChatLayout from '$components/ChatLayout.svelte';
	import BaseMessageList from '$components/BaseMessageList.svelte';
	import { useChatStream } from '$lib/useChatStream';
	import Prompt from '$components/Prompt.svelte';
	import type { PageData } from './$types';
	import { RemoteChain } from '$lib/chains/remoteRunnables';

	export let data: PageData;
	let { session, history } = data;
	$: ({ session, history } = data);

	const edulawQaChain = RemoteChain('edulaw-qa', session);

	const { input, loading, messages, events, handleSubmit } = useChatStream({
		history,
		chain: edulawQaChain,
		finalStream: '/edulaw-qa'
	});

	events.subscribe(($events) => {
		const last = $events[$events.length - 1];

		if (last) {
			const evName = `${last.name}/${last.event}`;
			console.log(evName, last.data);
		}
	});
</script>

<ChatLayout>
	<svelte:fragment slot="messages" let:scrollToBottom>
		<BaseMessageList messagesStore={messages} {scrollToBottom} />
	</svelte:fragment>

	<div slot="prompt" class="flex justify-center p-4">
		<Prompt
			bind:value={$input}
			on:submit={handleSubmit}
			label="Send"
			placeholder="Ask a question"
			loading={$loading}
		/>
	</div>
</ChatLayout>
