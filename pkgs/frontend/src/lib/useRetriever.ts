import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { derived, writable } from 'svelte/store';
import { RemoteEmbeddings } from '$lib/embeddings/RemoteEmbeddings';
import type { MatchDocumentsRpc, MatchedDocuments } from '$lib/db/public';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

export type UseRetrievalInput = {
	session: Session;
	supabase: SupabaseClient;
	options: Omit<MatchDocumentsRpc['Args'], 'query_embedding'>;
};

export type RetrievalStatus = 'embedQuery' | 'retrieval' | 'ready' | 'error';

export default function useRetriever({ session, supabase, options }: UseRetrievalInput) {
	const embeddings = new RemoteEmbeddings({}, session);
	const documents = writable<MatchedDocuments>([]);
	const status = writable<RetrievalStatus>('ready');
	const loading = derived(status, ($status) => $status !== 'ready');

	async function retrieveDocuments({ input: query }: { input: string }) {
		status.set('embedQuery');
		const query_embedding = await embeddings.embedQuery(query);

		status.set('retrieval');

		const rpcOptions: MatchDocumentsRpc['Args'] = { ...options, query_embedding };
		const { data, error } = await supabase
			.rpc('match_documents_via_embeddings', rpcOptions)
			.returns<MatchedDocuments>();
		if (error) {
			status.set('error');
			throw error;
		}

		status.set('ready');
		return data;
	}
	const retriever = new RunnableLambda({ func: retrieveDocuments });

	const formatDocs = (docs: MatchedDocuments) => {
		const contents = docs.map((doc) => doc.content);

		return contents.join('\n');
	};

	const updateStore = (docs: MatchedDocuments) => {
		documents.set(docs);

		return docs;
	};

	const chain = RunnableSequence.from([retriever, updateStore, formatDocs]);

	return { chain, documents, status, loading };
}
