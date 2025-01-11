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
      head: [
        {
          tag: "script",
          content: `
            import { inject } from '@vercel/analytics';
            inject();
          `,
        },
      ],
      sidebar: [
        // {
        //   label: "Landing Pages WIP",
        //   items: [
        //     { label: "Starting with flow def", slug: "index" },
        //     {
        //       label: "Flow DSL crash course",
        //       slug: "landing_pages/flow_usage",
        //     },
        //   ],
        // },
        // {
        //   label: "Spikes, ideas",
        //   items: [
        //     {
        //       label: "Versioning: always new flow",
        //       slug: "ideas/versioning_always_new_flow",
        //     },
        //     {
        //       label: "Versioning: migrate payload",
        //       slug: "ideas/versioning_migrate_payload",
        //     },
        //   ],
        // },
      ],
      expressiveCode: {
        themes: ["tokyo-night"],
      },
    }),
  ],
});
