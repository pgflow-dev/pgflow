import { type Database } from '$lib/db';
import type { ShareMetadata } from '$lib/shareMetadataSchema';

export type Share = Database['feed']['Tables']['shares']['Row'];
export type InferredFeedShareRow = Share & {
	inferred_type: string;
	inferred: ShareMetadata;
};

export type Bookmark = Database['feed']['Tables']['bookmarks']['Row'] & { type: 'bookmark' };
export type Event = Database['feed']['Tables']['events']['Row'] & { type: 'event' };
export type Todo = Database['feed']['Tables']['todos']['Row'] & { type: 'todo' };
export type Note = Database['feed']['Tables']['notes']['Row'] & { type: 'note' };
export type CodeSnippet = Database['feed']['Tables']['code_snippets']['Row'] & {
	type: 'code_snippet';
};
export type Person = Database['feed']['Tables']['people']['Row'] & {
	type: 'person';
};

export type Entity = Bookmark | Event | Todo | Note | CodeSnippet | Person;
