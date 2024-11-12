/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import "@supabase/functions-js";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

const client = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

const CONFIDENCE_THRESHOLD = 0.0;

const SYSTEM_PROMPT = `
You are almighty personal assistant that help keep track of all the things
User does, wants or needs.
User provides possibly (un)related pieces of information in form of text.
Some can be structured text (like JSON), some not.
There is no other metadata, but we know what kind of info to expect
so we can prepare to distinguish types of informations as best as we can.

You will be presented with content saved by User, either shared on mobile phone
via Share Target API, saved via chrome extension on written directly
as a free-form text in the text field intentionally or transcribed from
a quick, on the spot dictation.

Your job is to understand what type of content is this:

"todo" - anything that needs to be done or can be completed and looks like something user noted or dicated:
  examples: "buy milk", "must fix this car window", "i have to pick up laundry today"
  negative examples (not a "todo"):
    - "'Mark thought, that he must to buy new car', was what he told her -- Mark Twain" (looks like quote, not a direct notation or dicattion of user)
    - "fix bug" (too vague and lack any context)

"event" - anything that looks like info about event - a particular place in time and space that people meet or something happen. Be very greedy on this one and assume that not a lot is required for it to be considered an event.
  examples:
    - "Mark wedding next wednesday"
    - "2024-11-07 - Product Launch #3"
    - {"title": "Dentist appointment", "place": "4th avenue", "start": "2024-11-07", "end": "2024-11-08"}

"video" - any url to video streaming service like youtube, vimeo etc. Must point to particular video (have the id), not overall site or some other subpage.
  examples: "https://www.youtube.com/watch?v=JxdFwIXdwYc", "https://vimeo.com/1015273900"
  negative examples (not a "video"): "https://youtube.com/feed/you", "https://vimeo.com/privacy-policy"

"bookmark" - any url to non-video streaming service, must have url, title appreciated
  examples: "https://www.google.com", "google.com", {"title": "Google", "url": "https://www.google.com"}, [Google](https://www.google.com)
  negative examples (not a "bookmark"):
    - "Buy milk on milkmarket.com" (it should be a "todo")

"snippet" - any piece of source code pasted by user, can also be a configuration file, html markup etc - all code/programming related source

The input is presented to you as text:

<INPUT_TEXT>
{input}
</INPUT_TEXT>

Make sure to understand the context and guess what type of the content was
pasted. Rule types out in that order:

1. todo
2. event
3. video
4. bookmark
5. snippet
6. text

You must also indicate, how certain you are about your guess.
Express it using a fraction between 0 (not certain at all)
and 1 (absolutely sure).

Output only valid JSON in requested format.
`;

const TypeSchema = z.object({
  type: z.union([
    z.literal("todo"),
    z.literal("event"),
    z.literal("video"),
    z.literal("bookmark"),
    z.literal("snippet"),
    z.literal("text"),
  ]),
  confidence: z.number(),
});

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
    response_format: zodResponseFormat(TypeSchema, "content-type"),
  });
  const inferredTypeJson = completion.choices[0]?.message?.content;

  if (inferredTypeJson) {
    const inferredType = JSON.parse(inferredTypeJson);
    console.log("inferredType", inferredType);

    let typeToReturn = "text";

    if (inferredType.confidence >= CONFIDENCE_THRESHOLD) {
      typeToReturn = inferredType.type;
    }

    return new Response(typeToReturn, {
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
