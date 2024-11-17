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
      sidebar: [
        {
          label: "Work-In-Progress",
          items: [{ label: "Home", slug: "index" }],
        },
        {
          label: "AI Generated Docs",
          items: [
            {
              label: "Explain in a simple way ",
              slug: "explain_in_a_simple_way",
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
