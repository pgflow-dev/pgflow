/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import "npm:openai";
import OpenAI from "npm:openai@^4.52.5";
import { zodResponseFormat } from "npm:openai/helpers/zod";
import { ShareMetadataSchema } from "../_shared/shareMetadataSchema.ts";

const client = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

const SYSTEM_PROMPT = `
You are skilled UX designer. You will get random piece of JSON content that
represents saved text, that comes mostly from Share Target API, but can albo be pasted.

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
- "type": "event" - for any calendar-like events with specific date and optional time
- "type": "video" - for any youtube and other videos
- "type": "snippet" - for any code or monospace related content
- "type": "bookmark" - for any link that was not recognized as more specific UI type. Must have URL, Title is optional but encouraged.
- "type": "text" - just text, for everything else

Example extracted metadata:

{
  "keywords": ["rails", "ruby", "http", "database", "github"],
  "ui": {
    "type": "bookmark",
    "title": "Ruby On Rails - GitHub",
    "url": "https://github.com/rails/rails"
  }
}
`;

Deno.serve(async (req: Request) => {
  const input = await req.text();
  const currentDate = new Date().toISOString();

  const completion = await client.chat.completions.create({
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT + "\nCurrent Date: " + currentDate,
      },
      { role: "user", content: input },
    ],
    model: "gpt-4o-mini-2024-07-18",
    response_format: zodResponseFormat(ShareMetadataSchema, "share-metadata"),
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
