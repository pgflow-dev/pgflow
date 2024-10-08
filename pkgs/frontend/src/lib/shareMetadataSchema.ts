import { z } from 'zod';

const UI = {
	Event: z.object({
		type: z.literal('event'),
		datetime: z.string(),
		title: z.string(),
		place: z.string(),
		description: z.string()
	}),
	Video: z.object({
		type: z.literal('video'),
		url: z.string(),
		title: z.string()
	}),
	Snippet: z.object({
		type: z.literal('snippet'),
		source: z.string(),
		language_code: z.string()
	}),
	Bookmark: z.object({
		type: z.literal('bookmark'),
		url: z.string(),
		title: z.string()
	}),
	Text: z.object({
		type: z.literal('text'),
		text: z.string()
	})
};

export const ShareMetadataSchema = z.object({
	keywords: z.array(z.string()),
	ui: z.union([UI.Event, UI.Video, UI.Snippet, UI.Bookmark, UI.Text])
});
export type ShareMetadata = z.infer<typeof ShareMetadataSchema>;
export type InferredBookmark = z.infer<typeof UI.Bookmark>;
export type InferredText = z.infer<typeof UI.Text>;
export type InferredSnippet = z.infer<typeof UI.Snippet>;
export type InferredEvent = z.infer<typeof UI.Event>;
export type InferredComponent = InferredBookmark | InferredText | InferredSnippet | InferredEvent;
