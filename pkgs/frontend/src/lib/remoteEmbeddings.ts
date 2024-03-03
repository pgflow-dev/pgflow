import type { EmbeddingsInterface, EmbeddingsParams } from '@langchain/core/embeddings';
import { RemoteChain } from '$lib/remoteRunnables';
import { Runnable } from 'langchain/runnables';

export class RemoteEmbeddings implements EmbeddingsInterface {
	params: EmbeddingsParams;
	private _embedQueryChain: Runnable;
	private _embedDocumentsChain: Runnable;

	// /**
	//  * The async caller should be used by subclasses to make any async calls,
	//  * which will thus benefit from the concurrency and retry logic.
	//  */
	// caller: AsyncCaller;
	constructor(params: EmbeddingsParams) {
		this.params = params;
		this._embedQueryChain = RemoteChain('embed_query', { timeout: 5000 });
		this._embedDocumentsChain = RemoteChain('embed_documents', { timeout: 30000 });
	}

	/**
	 * An abstract method that takes an array of documents as input and
	 * returns a promise that resolves to an array of vectors for each
	 * document.
	 * @param documents An array of documents to be embedded.
	 * @returns A promise that resolves to an array of vectors for each document.
	 */
	embedDocuments(documents: string[]): Promise<number[][]> {
		return this._embedQueryChain.invoke(documents);
	}

	/**
	 * An abstract method that takes a single document as input and returns a
	 * promise that resolves to a vector for the query document.
	 * @param document A single document to be embedded.
	 * @returns A promise that resolves to a vector for the query document.
	 */
	embedQuery(query: string): Promise<number[]> {
		return this._embedQueryChain.invoke(query);
	}
}
