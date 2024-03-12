import { RemoteRunnable } from '@langchain/core/runnables/remote';
import { PUBLIC_EDULAW_URL } from '$env/static/public';
import type { Session } from '@supabase/supabase-js';

interface RemoteChainOptions {
	timeout: number;
	headers?: Record<string, string>;
}

export function RemoteChain(
	path: string,
	session: Session,
	options: RemoteChainOptions = { timeout: 10000 }
) {
	const { access_token } = session;

	if (access_token) {
		options.headers = {
			Authorization: `Bearer ${access_token}`
		};
	}

	return new RemoteRunnable({
		url: `${PUBLIC_EDULAW_URL}/${path}`,
		options: options
	});
}

export const MODEL_IDS = [
	'ChatOpenAI',
	'ChatGroq/mixtral-8x7b',
	'ChatGroq/llama2-70b',
	'ChatGroq/gemma-7b-it',
	'ChatOllama/dolphin-mixtral'
] as const;
export type RemoteModelId = (typeof MODEL_IDS)[number];

export function RemoteModel(
	model: RemoteModelId,
	session: Session,
	options: RemoteChainOptions = { timeout: 10000 }
) {
	return RemoteChain(`models/${model}`, session, options);
}
