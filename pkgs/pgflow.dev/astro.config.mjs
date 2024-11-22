// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "pgflow",
      social: {
        github: "https://github.com/jumski",
      },
      components: {
        SiteTitle: "./src/components/SiteTitle.astro",
      },
      sidebar: [
        {
          label: "Landing Pages WIP",
          items: [
            { label: "Starting with flow def", slug: "index" },
            { label: "Starting with React", slug: "starting_with_react" },
          ],
        },
        {
          label: "Spikes, ideas",
          items: [
            { label: "Test Multifile Code", slug: "ideas/test_multifile_code" },
            {
              label: "Versioning: always new flow",
              slug: "ideas/versioning_always_new_flow",
            },
            {
              label: "Versioning: always new flow",
              slug: "ideas/versioning_migrate_payload",
            },
          ],
        },
        {
          label: "AI Generated Docs",
          items: [
            {
              label: "Explain in a simple way ",
              slug: "ai_generated/explain_in_a_simple_way",
            },
            {
              label: "From frontend perspective",
              slug: "ai_generated/from_frontend_perspective",
            },
            {
              label: "Anatomy of a flow",
              slug: "ai_generated/anatomy_of_a_flow",
            },
            {
              label: "Flow lifecyce",
              slug: "ai_generated/flow_lifecycle",
            },
          ],
        },
        // {
        //   label: "Guides",
        //   items: [
        //     // Each item here is one entry in the navigation menu.
        //     { label: "Example Guide", slug: "guides/example" },
        //   ],
        // },
        // {
        //   label: "Reference",
        //   autogenerate: { directory: "reference" },
        // },
      ],
      expressiveCode: {
        themes: ["tokyo-night"],
      },
    }),
  ],
});
