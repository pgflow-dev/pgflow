/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import "npm:openai";
import { z } from "npm:zod";
import OpenAI from "npm:openai@^4.52.5";

const client = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

const ConfidenceSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  confidence: z.number(),
});

const Schema = z.object({
  content_type: ConfidenceSchema.extend({
    value: z.string(),
  }),
  text_length: z.number().int(),
  language: ConfidenceSchema.extend({
    value: z.string(),
  }),
  action_verb: ConfidenceSchema.extend({
    value: z.string(),
  }),
  time_related: ConfidenceSchema.extend({
    value: z.boolean(),
  }),
  named_entities: ConfidenceSchema.extend({
    value: z.array(z.string()),
  }),
  context_keywords: ConfidenceSchema.extend({
    value: z.array(z.string()),
  }),
  formatting_cues: ConfidenceSchema.extend({
    value: z.array(z.string()),
  }),
  task_oriented: ConfidenceSchema.extend({
    value: z.boolean(),
  }),
  urgency_level: ConfidenceSchema.extend({
    value: z.number().int(),
  }),
  requires_response: ConfidenceSchema.extend({
    value: z.boolean(),
  }),
  collaboration_required: ConfidenceSchema.extend({
    value: z.boolean(),
  }),
  project_related: ConfidenceSchema.extend({
    value: z.boolean(),
  }),
  actionability_score: ConfidenceSchema.extend({
    value: z.number(),
  }),
});

type SchemaType = z.infer<typeof Schema>;

const SYSTEM_PROMPT = `
Analyze the given text and provide a JSON object containing the following metrics. Each metric should be accompanied by a confidence score between 0 and 1, where 1 indicates high confidence and 0 indicates low confidence.

    content_type (string): Determine if the text is a snippet, code, single name, todo item, or calendar event.
    text_length (integer): Count the number of characters in the text.
    language (string): Identify the primary language used.
    action_verb (string): Extract the main action verb if present.
    time_related (boolean): Indicate if the text contains any time-related information.
    named_entities (array of strings): List any identified named entities (people, organizations, locations).
    context_keywords (array of strings): Extract key terms that provide context.
    formatting_cues (array of strings): Identify any special formatting (e.g., bullet points, all caps).
    task_oriented (boolean): Determine if the text represents a task or action item.
    urgency_level (integer): Rate the urgency on a scale of 0 (low) to 5 (high).
    requires_response (boolean): Indicate if the text includes a question or requires a response.
    collaboration_required (boolean): Determine if the text suggests collaboration or involvement of others.
    project_related (boolean): Indicate if the text seems related to a specific project.
    actionability_score (number): Provide an overall actionability score from 0 to 1.
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
