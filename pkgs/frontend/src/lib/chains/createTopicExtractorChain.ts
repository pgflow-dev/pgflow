import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createProxiedChatModel } from '$lib/models/ProxiedChatOpenAI';
import type { Session } from '@supabase/supabase-js';
import { StringOutputParser } from '@langchain/core/output_parsers';

const PROMPT = `Napisz listę potencjalnych tematów, które porusza poniższe pytanie.
Zwróć jeden temat na linię. Bądź zwięzły i odpowiadaj wyłącznie w kontekście edukacji i ustawy o prawie oświatowym.

Pytanie: {input}`;

export function createTopicExtractorChain(session: Session) {
	const prompt = ChatPromptTemplate.fromTemplate(PROMPT);
	const model = createProxiedChatModel('ChatOpenAI', session);
	const parser = new StringOutputParser();

	return prompt.pipe(model).pipe(parser);
}
