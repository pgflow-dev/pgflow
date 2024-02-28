import { RemoteRunnable } from '@langchain/core/runnables/remote';
import { PUBLIC_EDULAW_URL } from '$env/static/public';

interface RemoteChainOptions {
	timeout: number;
}

export function RemoteChain(path: string, options: RemoteChainOptions = { timeout: 5000 }) {
	return new RemoteRunnable({
		url: `${PUBLIC_EDULAW_URL}/${path}`,
		options: options
	});
}

export function RemoteChatOpenAI(options: RemoteChainOptions = { timeout: 5000 }) {
	return RemoteChain('models/ChatOpenAI', options);
}
