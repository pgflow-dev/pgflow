import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { topicSchema } from 'starlight-sidebar-topics/schema'
import { blogSchema } from 'starlight-blog/schema'

export const collections = {
  docs: defineCollection({ 
    loader: docsLoader(), 
    schema: docsSchema({ 
      extend: (context) => topicSchema.merge(blogSchema(context))
    })
  }),
};