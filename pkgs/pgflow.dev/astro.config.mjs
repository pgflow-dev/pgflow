// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';

const GITHUB_REPO_URL = 'https://github.com/pgflow-dev/pgflow';

// https://astro.build/config
export default defineConfig({
  site: 'https://pgflow.dev',
  integrations: [
    starlight({
      plugins: [starlightLinksValidator()],
      title: 'pgflow',
      editLink: {
        baseUrl: `${GITHUB_REPO_URL}/edit/main/pkgs/pgflow.dev/`,
      },
      social: {
        github: GITHUB_REPO_URL,
        twitter: 'https://x.com/pgflow_dev',
        blueSky: 'https://bsky.app/profile/pgflow.bsky.social',
      },
      components: {},
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
            { label: 'Observability', slug: 'edge-worker/observability' },
            { label: '⚠️ Project Status', slug: 'edge-worker/project-status' },
          ],
        },
      ],
    }),
  ],
});
