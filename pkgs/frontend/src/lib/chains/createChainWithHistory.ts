import { RunnableSequence } from '@langchain/core/runnables';
import type { ChatPromptTemplate } from '@langchain/core/prompts';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { SupabaseChatMessageHistory } from '$lib/chat_histories/SupabaseChatMessageHistory';

type ChainWithHistoryFields = {
	prompt: ChatPromptTemplate;
	model: BaseChatModel;
	history: SupabaseChatMessageHistory;
};

export function createChainWithHistory(fields: ChainWithHistoryFields) {
	const { prompt, model, history } = fields;

	return RunnableSequence.from([
		history.asMessageLoader(),
		prompt,
		history.asMessageSaver(),
		model
	]);
}
