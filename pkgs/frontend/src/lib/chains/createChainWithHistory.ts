import { RunnableSequence, RunnablePassthrough, RunnableLambda } from '@langchain/core/runnables';
// import { type BaseMessage } from '@langchain/core/messages';
import { ChatPromptValue } from '@langchain/core/prompt_values';
import type { ChatPromptTemplate } from '@langchain/core/prompts';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseListChatMessageHistory } from '@langchain/core/chat_history';

type ChainWithHistoryFields = {
	prompt: ChatPromptTemplate;
	model: BaseChatModel;
	history: BaseListChatMessageHistory;
};

export function createChainWithHistory(fields: ChainWithHistoryFields) {
	const { prompt, model, history } = fields;

	const loadMessages = RunnablePassthrough.assign({
		messages: () => history.getMessages()
	});

	const saveHumanMessage = new RunnableLambda({
		func: (chatPromptValue: ChatPromptValue) => {
			const { messages } = chatPromptValue;
			const humanMessage = messages[messages.length - 1];
			history.addMessage(humanMessage);

			return chatPromptValue;
		}
	});

	// const saveAIMessage = new RunnableLambda({
	// 	func: (output: BaseMessage) => {
	// 		history.addMessage(output);
	// 		return output;
	// 	}
	// });

	return RunnableSequence.from([loadMessages, prompt, saveHumanMessage, model]);
}
