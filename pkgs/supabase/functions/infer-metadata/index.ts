/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import "npm:openai";
import { z } from "npm:zod";
import OpenAI from "npm:openai@^4.52.5";
import { zodResponseFormat } from "npm:openai/helpers/zod";

const client = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

// # 'ui' key
// An object with required 'id' key. any additional key is a param for the UI component that will render the metadata.
// I will list all possible ui values below, listing UI component params in brackets, like this: ui_key(param1, param2)
// Type of UI that should be used to render this item. Must be one of the following:
// - 'event(datetime, title, place, description)' - for any calendar-like events with specific date and optional time
// - 'video(url, title)' - for any youtube and other videos
// - 'snippet(source, language_code)' - for any code or monospace related content
// - 'card(header, emoji, text)' - for things like stars, likes, persons, items, bookmarks, everything that should stand next to icon/emoji and stand out
// - 'action(text, emoji)' - for anything actionable that can be "COMPLETED", like todo items, movie "watch later" items etc.
// - 'text(text)' - just text, for everything else
const UI = {
  Event: z.object({
    type: z.literal("event"),
    datetime: z.string(),
    title: z.string(),
    place: z.string(),
    description: z.string(),
  }),
  Video: z.object({
    type: z.literal("video"),
    url: z.string(),
    title: z.string(),
  }),
  Snippet: z.object({
    type: z.literal("snippet"),
    source: z.string(),
    language_code: z.string(),
  }),
  Card: z.object({
    type: z.literal("card"),
    header: z.string(),
    emoji: z.string(),
    text: z.string(),
  }),
  Action: z.object({
    type: z.literal("action"),
    completed: z.boolean(),
    text: z.string(),
  }),
  Bookmark: z.object({
    type: z.literal("bookmark"),
    url: z.string(),
    title: z.string(),
  }),
  Text: z.object({
    type: z.literal("text"),
    text: z.string(),
  }),
};
const NoteMetadataSchema = z.object({
  type: z.enum(["github_star", "note", "todo", "bookmark"]),
  value: z.string(),
  keywords: z.array(z.string()),
  ui: z.union([
    UI.Event,
    UI.Video,
    UI.Snippet,
    UI.Card,
    UI.Action,
    UI.Bookmark,
    UI.Text,
  ]),
});
type StructuredOutput = z.infer<typeof NoteMetadataSchema>;

const SYSTEM_PROMPT = `
You are skilled UX designer. You will get random piece of saved text, that
comes mostly from Share Target API, but can albo be pasted.

Your job is to guess, what kind of content is this and what kind of
UI component would be best suited to show this particular content.

Output only valid JSON according to provided schema, with following field definitions:

# 'keywords'
You extract keywords relevant to the content itself.
Keywords is just an array of strings, each string is a keyword.
Use only good matching keywords.

# 'ui' key
An object with required 'type' key. any additional key is a param for the UI component that will render the metadata.
'type' key determines what kind of UI is best to render this particular content type.
All possible 'type' values below, listing UI component params in brackets, like this: type(param1, param2)
Type of UI that should be used to render this item. Must be one of the following:
- 'event(datetime, title, place, description)' - for any calendar-like events with specific date and optional time
- 'video(url, title)' - for any youtube and other videos
- 'snippet(source, language_code)' - for any code or monospace related content
- 'card(header, emoji, text)' - for things like stars, likes, persons, items, bookmarks, everything that should stand next to icon/emoji and stand out
- 'action(text, emoji)' - for anything actionable that can be "COMPLETED", like todo items, movie "watch later" items etc.
- 'bookmark(title, url)' - for any link that was not recognized as more specific UI type. Must have URL, Title is optional but encouraged.
- 'text(text)' - just text, for everything else

Example extracted metadata:

{
  "type": "bookmark",
  "value": "https://github.com/rails/rails",
  "keywords": ["rails", "ruby", "http", "database", "github"],
  "ui": {
    "type": "bookmark",
    "title": "Ruby On Rails - GitHub",
    "url": "https://github.com/rails/rails"
  }
}
`;

Deno.serve(async (req: Request) => {
  const { input } = await req.json();
  const completion = await client.chat.completions.create({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: input },
    ],
    // model: "gpt-4o",
    model: "gpt-4o-mini-2024-07-18",
    response_format: zodResponseFormat(NoteMetadataSchema, "note-metadata"),
  });
  const content = completion.choices[0]?.message?.content;

  if (content) {
    return new Response(content, {
      headers: {
        "Content-Type": "application/json",
        Connection: "keep-alive",
      },
    });
  } else {
    return new Response(JSON.stringify({ error: "No metadata found" }), {
      headers: {
        "Content-Type": "application/json",
        Connection: "keep-alive",
      },
    });
  }
});
