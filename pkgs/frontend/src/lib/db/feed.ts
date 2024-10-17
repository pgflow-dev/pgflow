import { type Database } from '$lib/db';
import type { ShareMetadata } from '$lib/shareMetadataSchema';

export type Share = Database['feed']['Tables']['shares']['Row'];
export type InferredFeedShareRow = Share & {
	inferred_type: string;
	inferred: ShareMetadata;
};
