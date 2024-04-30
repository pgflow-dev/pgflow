import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createProxiedChatModel } from '$lib/models/ProxiedChatOpenAI';
import type { Session } from '@supabase/supabase-js';
import { StringOutputParser } from '@langchain/core/output_parsers';

const PROMPT = `Twoim zadaniem jest przekształcenie wiadomości użytkownika na samodzielne, niezależne pytabine.
Usuń treści nieistotne lub nie związane z tematem prawa oświatowego i edukacji.
Nie pisz "Zapytanie:" lub cokolwiek podobnego. Napisz wyłącznie treść.

Wiadomość użytkownika: {input}`;

export function createRephraseToQueryChain(session: Session) {
	const prompt = ChatPromptTemplate.fromTemplate(PROMPT);
	const model = createProxiedChatModel('ChatOpenAI', session);
	const parser = new StringOutputParser();

	return prompt.pipe(model).pipe(parser);
}
