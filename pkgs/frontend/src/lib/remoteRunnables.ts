import { RemoteRunnable } from '@langchain/core/runnables/remote';
import { PUBLIC_EDULAW_URL } from '$env/static/public';

interface RemoteChainOptions {
	timeout: number;
	headers?: Record<string, string>;
}

export function RemoteChain(
	path: string,
	authToken: string,
	options: RemoteChainOptions = { timeout: 10000 }
) {
	if (authToken) {
		options.headers = {
			Authorization: `Bearer ${authToken}`
		};
	}

	return new RemoteRunnable({
		url: `${PUBLIC_EDULAW_URL}/${path}`,
		options: options
	});
}

export function RemoteChatOpenAI(
	authToken: string,
	options: RemoteChainOptions = { timeout: 10000 }
) {
	return RemoteChain('models/ChatOpenAI', authToken, options);
}
