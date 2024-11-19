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
            { label: "Test Multifile Code", slug: "test_multifile_code" },
          ],
        },
        {
          label: "AI Generated Docs",
          items: [
            {
              label: "Explain in a simple way ",
              slug: "explain_in_a_simple_way",
            },
            {
              label: "From frontend perspective",
              slug: "from_frontend_perspective",
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
