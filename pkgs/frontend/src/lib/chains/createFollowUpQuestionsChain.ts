import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { createProxiedChatModel } from '$lib/models/ProxiedChatOpenAI';
import type { Session } from '@supabase/supabase-js';
import { StringOutputParser } from '@langchain/core/output_parsers';

const prompt = ChatPromptTemplate.fromMessages([
	[
		'system',
		`Jesteś pomocnym asystentem i uczestniczysz w rozmowie na temat edukacji i prawa oświatowego.
		Zostałeś wezwany, ponieważ na podstawie historii konwersacji oraz ostatniej wiadomości użytkownika
		nie jest możliwe sformułowanie jasno brzmiącego zapytania do wyszukiwarki sematycznej.
		Twoim zadaniem jest zadawanie użytkownikowi pomocniczych pytań dzięki którym będzie
		możliwe zawężenie dyskusji i sformułowanie takiego zapytania.`
	],
	new MessagesPlaceholder('messages'),
	['user', '{input}']
]);

export function createFollowUpQuestionsChain(session: Session) {
	const model = createProxiedChatModel('ChatOpenAI', session);
	const parser = new StringOutputParser();

	return prompt.pipe(model).pipe(parser);
}
