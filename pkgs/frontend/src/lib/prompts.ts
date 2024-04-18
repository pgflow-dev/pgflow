import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

export const chatWithHistoryAndContextPrompt = ChatPromptTemplate.fromMessages([
	[
		'system',
		'You are a helpful assistant. You try to answer user questions only based on the provided context: {context}. If you do not know the answer or context is useless to answer user question, just say "I am not sure"'
	],
	new MessagesPlaceholder('messages'),
	['user', '{input}']
]);
