import { ChatOpenAI } from '@langchain/openai';
import { PUBLIC_EDULAW_URL } from '$env/static/public';
import type { Session } from '@supabase/supabase-js';

type ChatOpenAIArgs = ConstructorParameters<typeof ChatOpenAI>[0];

type ProxyableChatModel = 'ChatOpenAI';

export function createProxiedChatModel(
	chatModelKlass: ProxyableChatModel,
	supabaseSession: Session,
	fields?: ChatOpenAIArgs
) {
	const edulawURL = PUBLIC_EDULAW_URL.replace(/\/$/, '');
	const baseURL = `${edulawURL}/proxy/openai`;

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

	if (chatModelKlass === 'ChatOpenAI') {
		return new ChatOpenAI({ ...fields });
	} else {
		throw new Error(`Unsupported chat model: ${chatModelKlass}`);
	}
}
