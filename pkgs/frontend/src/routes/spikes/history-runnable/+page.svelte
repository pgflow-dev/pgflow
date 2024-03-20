<script lang="ts">
	import { ChatPromptTemplate } from '@langchain/core/prompts';
	import { createProxiedChatModel } from '$lib/ProxiedChatOpenAI';
	import { ChatMessageHistoryStore } from '$lib/ChatMessageHistoryStore';
	import { RunnableSequence, RunnablePassthrough, RunnableLambda } from '@langchain/core/runnables';
	import { type BaseMessage } from '@langchain/core/messages';
	// import Debug from '$components/Debug.svelte';
	import Prompt from '$components/Prompt.svelte';
	import ChatLayout from '$components/ChatLayout.svelte';
	import BaseMessageList from '$components/BaseMessageList.svelte';
	import { ChatPromptValue } from '@langchain/core/prompt_values';

	export let data;
	let { session } = data;
	$: ({ session } = data);

	const chatHistory = new ChatMessageHistoryStore();
	const messages = chatHistory.messagesStore;

	const prompt = ChatPromptTemplate.fromTemplate('{input}');
	const model = createProxiedChatModel('ChatOpenAI', session);

	const chain = RunnableSequence.from([
		RunnablePassthrough.assign({
			history: () => chatHistory.getMessages()
		}),

		prompt,

		// save HumanMessage
		new RunnableLambda({
			func: (chatPromptValue: ChatPromptValue) => {
				const { messages } = chatPromptValue;
				const humanMessage = messages[messages.length - 1];
				chatHistory.addMessage(humanMessage);

				return chatPromptValue;
			}
		}),

		model,

		// save AIMessage
		new RunnableLambda({
			func: (output: BaseMessage) => {
				chatHistory.addMessage(output);
				return output;
			}
		})
	]);

	let userInput = '';

	async function run() {
		let response = await chain.invoke({ input: userInput });
		userInput = '';

		console.log('response', response);
	}
</script>

<ChatLayout>
	<svelte:fragment slot="messages">
		<BaseMessageList messagesStore={messages} />
	</svelte:fragment>

	<svelte:fragment slot="prompt">
		<Prompt bind:value={userInput} on:submit={run} label="Send" placeholder="Ask a question" />
	</svelte:fragment>
</ChatLayout>
