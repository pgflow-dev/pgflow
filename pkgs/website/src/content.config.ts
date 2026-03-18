import { defineCollection, z } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { topicSchema } from 'starlight-sidebar-topics/schema'
import { blogSchema } from 'starlight-blog/schema'

export const collections = {
  docs: defineCollection({ 
    loader: docsLoader(), 
    schema: docsSchema({ 
      extend: (context) =>
        topicSchema
          .merge(blogSchema(context))
          // Task-oriented routing override used by the /docs-index endpoints.
          // Add only where `description` is materially ambiguous for routing.
          .extend({ agentHint: z.string().optional() })
    })
  }),
};