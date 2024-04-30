import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createProxiedChatModel } from '$lib/models/ProxiedChatOpenAI';
import type { Session } from '@supabase/supabase-js';
import { StringOutputParser } from '@langchain/core/output_parsers';

const PROMPT = `
Na podstawie historii rozmowy z użytkownikiem oceń, czy na podstawie jego najnowszej wiadomości
jest możliwe zadanie samodzielnego, jasno brzmiącego pytania.
Jeśli tak, napisz literkę "T", jeśli nie, napisz literkę "N".
Nie pisz nic innego.

HISTORIA ROZMOWY:
{messages}
`;

const LettersToTokenIds = {
	T: 51,
	N: 45
};

export function createEntryRouterChain(session: Session) {
	const prompt = ChatPromptTemplate.fromTemplate(PROMPT);
	const model = createProxiedChatModel('ChatOpenAI', session, {
		logitBias: {
			[LettersToTokenIds['T']]: 100,
			[LettersToTokenIds['N']]: 100
		}
	});
	const parser = new StringOutputParser();

	return prompt
		.pipe(model)
		.pipe(parser)
		.pipe((v) => v === 'T');
}
