import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createProxiedChatModel } from '$lib/models/ProxiedChatOpenAI';
import type { Session } from '@supabase/supabase-js';
import { StringOutputParser } from '@langchain/core/output_parsers';

const PROMPT = `Create 3-5 word summary for the following text. Make sure you do not exceed 5 word limit. The summary will be used as a title for a conversation.

Content to summarize: {input}`;

export function createTitleizeChain(session: Session) {
	const prompt = ChatPromptTemplate.fromTemplate(PROMPT);
	const model = createProxiedChatModel('ChatOpenAI', session);
	const parser = new StringOutputParser();

	return prompt.pipe(model).pipe(parser);
}
