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
      description:
        'Postgres-native workflow Engine with deep Supabase integration',
      logo: {
        replacesTitle: true,
        light: './src/assets/pgflow-logo-light.svg',
        dark: './src/assets/pgflow-logo-dark.svg',
      },
      editLink: {
        baseUrl: `${GITHUB_REPO_URL}/edit/main/pkgs/website/`,
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
            { label: 'How it works?', link: '/edge-worker/how-it-works' },
            {
              label: 'Getting started',
              autogenerate: { directory: 'edge-worker/getting-started' },
            },
            { label: '⚠️ Project Status', link: '/edge-worker/project-status' },
          ],
        },
      ],
    }),
  ],
});
