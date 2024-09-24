/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import "npm:openai";
import { z } from "npm:zod";
import OpenAI from "npm:openai@^4.52.5";

const client = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

const NoteMetadataSchema = z.object({
  type: z.enum(["github_star", "note", "todo", "bookmark"]),
  value: z.string(),
  keywords: z.array(z.string()),
});
type StructuredOutput = z.infer<typeof NoteMetadataSchema>;

const SYSTEM_PROMPT = `
You are skilled metadata extractor. You must extract few pieces of metadata
based on description of each piece and then output those as JSON object
with keys as metadata names and values as metadata values.

# 'type' key
Type can be one of following:
- github_star
- note
- todo
- bookmark

# 'value' key
Each type have its "value" and for each type it must be something type specific:

- github_star has the repo id in value: "rails/rails", "reactjs/react-tabs" etc.
- note has the note body text in value
- todo has the todo body text in value
- bookmark has the url in value

# 'keywords' key
An array of strings - each string is a keyword. Use only good matching keywords.
For example, for type github_star with value of rails/rails, you would extract
["rails", "ruby", "http", "database"]

# 'ui' key
An object with required 'id' key. any additional key is a param for the UI component that will render the metadata.
I will list all possible ui values below, listing UI component params in brackets, like this: ui_key(param1, param2)
Type of UI that should be used to render this item. Must be one of the following:
- 'event(datetime, title, place, description)' - for any calendar-like events with specific date and optional time
- 'video(url, title)' - for any youtube and other videos
- 'snippet(source, language_code)' - for any code or monospace related content
- 'card(header, emoji, text)' - for things like stars, likes, persons, items, bookmarks, everything that should stand next to icon/emoji and stand out
- 'action(text, emoji)' - for anything actionable that can be "COMPLETED", like todo items, movie "watch later" items etc.
- 'text(text)' - just text, for everything else

Example extracted metadata:

{
  "type": "github_star",
  "value": "rails/rails",
  "keywords": ["rails", "ruby", "http", "database"],
}

Make sure to output valid JSON.
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
    response_format: { type: "json_object" },
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
