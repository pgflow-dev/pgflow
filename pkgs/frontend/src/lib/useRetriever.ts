import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { Document } from '@langchain/core/documents';
import { derived, writable } from 'svelte/store';
import { RemoteEmbeddings } from '$lib/embeddings/RemoteEmbeddings';
import type { MatchDocumentsRpc } from '$lib/db';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

export type UseRetrievalInput = {
	session: Session;
	supabase: SupabaseClient;
};

export type RetrievalStatus = 'embedQuery' | 'retrieval' | 'ready' | 'error';

export default function useRetriever({ session, supabase }: UseRetrievalInput) {
	const embeddings = new RemoteEmbeddings({}, session);
	const documents = writable<Document[]>([]);
	const status = writable<RetrievalStatus>('ready');
	const loading = derived(status, ($status) => $status !== 'ready');

	async function retrieveDocuments({ input: query }: { input: string }) {
		status.set('embedQuery');
		const query_embedding = await embeddings.embedQuery(query);

		status.set('retrieval');
		const { data, error } = await supabase
			.rpc('match_documents', { query_embedding })
			.returns<MatchDocumentsRpc['Returns']>();
		if (error) {
			status.set('error');
			throw error;
		}

		status.set('ready');
		return data;
	}
	const retriever = new RunnableLambda({ func: retrieveDocuments });

	const formatDocs = (docs: Document[]) => {
		const contents = docs.map((doc) => doc.pageContent);

		return contents.join('\n');
	};

	const updateStore = (docs: Document[]) => {
		documents.set(docs);

		return docs;
	};

	const chain = RunnableSequence.from([retriever, updateStore, formatDocs]);

	return { chain, documents, status, loading };
}
