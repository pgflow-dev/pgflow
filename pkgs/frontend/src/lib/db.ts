import type { Database as DatabaseGenerated, Json } from '$backend/types';
import type { MergeDeep } from 'type-fest';

// Override the type for a specific column in a view:
export type Database = MergeDeep<
	DatabaseGenerated,
	{
		public: {
			Functions: {
				match_documents: {
					Args: {
						query_embedding: number[];
						match_count?: number;
						match_threshold?: number;
						filter?: Json;
					};
					Returns: {
						id: string;
						content: string;
						metadata: Json;
						embedding: number[];
						similarity: number;
					}[];
				};
				match_documents_via_embeddings: {
					Args: {
						query_embedding: number[];
						match_count?: number;
						match_threshold?: number;
						filter?: Json;
						type_filter?: string;
					};
					Returns: {
						id: string;
						content: string;
						metadata: Json;
						embedding: number[];
						embedded_content: string;
						similarity: number;
					}[];
				};
			};
		};
	}
>;

export type MessageRow = Database['chat']['Tables']['messages']['Row'];
export type ConversationRow = Database['chat']['Tables']['conversations']['Row'];

export type ChatMessage = Pick<MessageRow, 'content' | 'role' | 'conversation_id'>;
export type ChatConversation = Pick<ConversationRow, 'id' | 'created_at' | 'title'>;

export type ChatConversationWithMessages = ChatConversation & { messages: ChatMessage[] };

export type MatchDocumentsRpc = Database['public']['Functions']['match_documents_via_embeddings'];
export type MatchedDocuments = MatchDocumentsRpc['Returns'];

export type FeedShareRow = Database['feed']['Tables']['shares']['Row'];

export type InferredFeedShareRow = FeedShareRow & {
	inferred: {
		type: string;
		value: string;
		keywords: string[];
	};
};
