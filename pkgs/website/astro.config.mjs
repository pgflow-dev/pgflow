// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import starlightSidebarTopics from 'starlight-sidebar-topics';

const GITHUB_REPO_URL = 'https://github.com/pgflow-dev/pgflow';

// https://astro.build/config
export default defineConfig({
  site: 'https://pgflow.dev',
  redirects: {
    '/edge-worker/how-to/run-on-hosted-supabase':
      '/edge-worker/how-to/deploy-to-supabasecom',
  },
  integrations: [
    starlight({
      favicon: '/favicons/favicon.ico',
      plugins: [
        starlightLinksValidator(),
        starlightSidebarTopics([
          {
            label: 'Edge Worker',
            icon: 'open-book',
            link: '/edge-worker/how-it-works',
            id: 'edge-worker',
            items: [
              { label: 'How it works?', link: '/edge-worker/how-it-works' },
              {
                label: 'Getting started',
                autogenerate: { directory: 'edge-worker/getting-started' },
              },
              {
                label: 'How to?',
                autogenerate: { directory: 'edge-worker/how-to' },
              },
              {
                label: 'Project Status',
                badge: { text: 'important', variant: 'caution' },
                link: '/edge-worker/project-status',
              },
            ],
          },
          {
            label: 'pgflow',
            icon: 'open-book',
            link: '/pgflow/',
            badge: {
              text: 'soon!',
              variant: 'note',
            },
            items: [
              { label: 'Getting started', link: '/pgflow/getting-started' },
              {
                label: '⚠️ Project Status',
                link: '/pgflow/project-status',
              },
            ],
          },
          {
            label: 'Found a bug?',
            icon: 'github',
            link: 'https://github.com/pgflow-dev/pgflow/issues/new',
          },
        ]),
      ],
      title: 'pgflow',
      description: 'Simple, Postgres-First Workflow Orchestration for Supabase',
      logo: {
        replacesTitle: true,
        light: './src/assets/pgflow-logo-light.svg',
        dark: './src/assets/pgflow-logo-dark.svg',
      },
      customCss: ['./src/styles/global.css'],
      editLink: {
        baseUrl: `${GITHUB_REPO_URL}/edit/main/pkgs/website/`,
      },
      social: {
        github: GITHUB_REPO_URL,
        twitter: 'https://x.com/pgflow_dev',
        blueSky: 'https://bsky.app/profile/pgflow.bsky.social',
      },
      components: {
        Hero: './src/components/ConditionalHero.astro',
      },
    }),
  ],
});
