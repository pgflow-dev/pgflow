// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: 'pgflow',
      social: {
        github: 'https://github.com/pgflow-dev/pgflow',
        discord: 'https://discord.gg/fyMHqy9h',
        twitter: 'https://x.com/pgflow_dev',
        blueSky: 'https://bsky.app/profile/pgflow.bsky.social',
      },
      components: {},
      head: [
        {
          tag: 'script',
          content: `
            import { inject } from '@vercel/analytics';
            inject();
          `,
        },
      ],
      sidebar: [
        {
          label: 'Edge Worker',
          items: [
            { label: 'How it works?', slug: 'edge-worker/how-it-works' },
            {
              label: 'Prepare environment',
              slug: 'edge-worker/prepare-environment',
            },
            {
              label: 'Create your first worker',
              slug: 'edge-worker/create-first-worker',
            },
            { label: 'Configuration', slug: 'edge-worker/configuration' },
            { label: 'Monitoring', slug: 'edge-worker/monitoring' },
          ],
        },
      ],
      expressiveCode: {
        themes: ['tokyo-night'],
      },
    }),
  ],
});
