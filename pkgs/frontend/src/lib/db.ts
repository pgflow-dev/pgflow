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
