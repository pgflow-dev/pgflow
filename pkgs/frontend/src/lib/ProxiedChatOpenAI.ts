import { ChatOpenAI } from '@langchain/openai';
import { PUBLIC_EDULAW_URL } from '$env/static/public';
import type { Session } from '@supabase/supabase-js';

type ChatOpenAIArgs = ConstructorParameters<typeof ChatOpenAI>[0];

export function createProxiedModel(supabaseSession: Session, fields?: ChatOpenAIArgs) {
	const baseURL = `${PUBLIC_EDULAW_URL}/proxy/openai/`;

	if (!fields) {
		fields = {};
	}
	fields = { ...fields, openAIApiKey: 'whatever' };

	if (!fields.configuration) {
		fields.configuration = {};
	}

	fields.configuration = {
		...fields.configuration,
		baseURL
	};

	fields.configuration.defaultHeaders = {
		...fields.configuration.defaultHeaders,
		Authorization: `Bearer ${supabaseSession.access_token}`
	};

	return new ChatOpenAI({ ...fields });
}
