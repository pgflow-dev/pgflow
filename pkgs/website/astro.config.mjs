// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import starlightSidebarTopics from 'starlight-sidebar-topics';

const GITHUB_REPO_URL = 'https://github.com/pgflow-dev/pgflow';

// https://astro.build/config
export default defineConfig({
  site: 'https://pgflow.dev',
  integrations: [
    starlight({
      favicon: '/favicons/favicon.ico',
      plugins: [
        starlightLinksValidator(),
        starlightSidebarTopics([
          {
            label: 'Edge Worker',
            icon: 'open-book',
            link: '/edge-worker/',
            items: [
              { label: 'How it works?', link: '/edge-worker/how-it-works' },
              {
                label: 'Getting started',
                autogenerate: { directory: 'edge-worker/getting-started' },
              },
              {
                label: '⚠️ Project Status',
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
      components: {},
    }),
  ],
});
