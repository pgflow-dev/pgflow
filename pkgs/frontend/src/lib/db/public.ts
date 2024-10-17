import { type Database } from '$lib/db';

export type MatchDocumentsRpc = Database['public']['Functions']['match_documents_via_embeddings'];
export type MatchedDocuments = MatchDocumentsRpc['Returns'];
