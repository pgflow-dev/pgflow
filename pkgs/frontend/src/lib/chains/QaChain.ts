import { createProxiedChatModel } from '$lib/ProxiedChatOpenAI';
import type { Session } from '@supabase/supabase-js';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableWithMessageHistory } from 'langchain/runnables';
import { BaseListChatMessageHistory } from '@langchain/core/chat_history';

export function createQaChain(session: Session) {
	const model = createProxiedChatModel('ChatOpenAI', session);
	const prompt = ChatPromptTemplate.fromMessages([
		['system', 'You are helpful assistant'],
		new MessagesPlaceholder('history'),
		['user', '{input}']
	]);

	return prompt.pipe(model);
}

interface QaChainWithHistoryFields {
	session: Session;
	conversationId: string;
	memory: BaseListChatMessageHistory;
}

export function createQaChainWithHistory(fields: QaChainWithHistoryFields) {
	const { session, conversationId, memory } = fields;

	const chain = createQaChain(session);
	const chainWithMemory = new RunnableWithMessageHistory({
		runnable: chain,
		getMessageHistory: () => memory,
		inputMessagesKey: 'input',
		historyMessagesKey: 'history',
		config: { configurable: { sessionId: conversationId } }
	});

	return chainWithMemory;
}
