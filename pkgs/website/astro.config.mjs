// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import starlightSidebarTopics from 'starlight-sidebar-topics';
import robotsTxt from 'astro-robots-txt';
import starlightLlmsTxt from 'starlight-llms-txt';

const GITHUB_REPO_URL = 'https://github.com/pgflow-dev/pgflow';
const PLAUSIBLE_PROXY = {
  url: 'https://wispy-pond-c6f8.wojciech-majewski.workers.dev',
  eventPath: '/data/event',
  scriptPath:
    '/assets/script.hash.outbound-links.pageview-props.tagged-events.js',
};
const DOMAIN_NAME = 'www.pgflow.dev';

// https://astro.build/config
export default defineConfig({
  site: `https://${DOMAIN_NAME}`,
  trailingSlash: 'always',
  build: {
    // prevents problems with trailing slash redirects (SEO issue)
    format: 'directory',
  },
  redirects: {
    '/edge-worker/how-to/run-on-hosted-supabase':
      '/edge-worker/how-to/deploy-to-supabasecom/',
  },
  integrations: [
    starlight({
      favicon: '/favicons/favicon.ico',
      head: [
        // prevent robots from indexing the preview branches
        // it can be determined by checking the appropriate env variable
        // CF_PAGES_BRANCH != 'main'
        {
          tag: 'meta',
          attrs: {
            name: 'robots',
            content:
              process.env.CF_PAGES_BRANCH === 'main'
                ? 'index,follow'
                : 'noindex,nofollow',
          },
        },
        {
          tag: 'script',
          attrs: {
            defer: true,
            'data-domain': DOMAIN_NAME,
            'data-api': PLAUSIBLE_PROXY.url + PLAUSIBLE_PROXY.eventPath,
            src: PLAUSIBLE_PROXY.url + PLAUSIBLE_PROXY.scriptPath,
          },
        },
      ],
      plugins: [
        starlightLlmsTxt(),
        starlightLinksValidator(),
        starlightSidebarTopics([
          {
            label: 'Edge Worker',
            icon: 'open-book',
            link: '/edge-worker/how-it-works/',
            id: 'edge-worker',
            items: [
              { label: 'How it works?', link: '/edge-worker/how-it-works/' },
              {
                label: 'Getting started',
                autogenerate: { directory: 'edge-worker/getting-started/' },
              },
              {
                label: 'How to?',
                autogenerate: { directory: 'edge-worker/how-to/' },
              },
              {
                label: 'Project Status',
                badge: { text: 'important', variant: 'caution' },
                link: '/edge-worker/project-status/',
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
              { label: 'Getting started', link: '/pgflow/getting-started/' },
              {
                label: '⚠️ Project Status',
                link: '/pgflow/project-status/',
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
      title: 'pgflow (Workflow Engine for Supabase)',
      description:
        'A workflow engine for Postgres using Supabase queues and background tasks to process jobs in parallel. Simple and built for a great developer experience.',
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
        'x.com': 'https://x.com/pgflow_dev',
        mastodon: 'https://mastodon.social/@pgflow',
      },
      components: {
        Hero: './src/components/ConditionalHero.astro',
      },
    }),
    robotsTxt({
      policy: [
        {
          userAgent: '*',
          allow: process.env.CF_PAGES_BRANCH === 'main' ? '/' : '',
          disallow: process.env.CF_PAGES_BRANCH === 'main' ? '' : '/',
        },
      ],
    }),
  ],
});
