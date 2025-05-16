// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import starlightSidebarTopics from 'starlight-sidebar-topics';
import robotsTxt from 'astro-robots-txt';
// import starlightLlmsTxt from 'starlight-llms-txt';
import { fileURLToPath } from 'url';
import path from 'path';
import react from '@astrojs/react';

const GITHUB_REPO_URL = 'https://github.com/pgflow-dev/pgflow';
const DISCORD_INVITE_URL = 'https://discord.gg/NpffdEyb';
const PLAUSIBLE_PROXY = {
  url: 'https://wispy-pond-c6f8.wojciech-majewski.workers.dev',
  eventPath: '/data/event',
  scriptPath:
    '/assets/script.hash.outbound-links.pageview-props.tagged-events.js',
};
const DOMAIN_NAME = 'www.pgflow.dev';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://astro.build/config
export default defineConfig({
  site: `https://${DOMAIN_NAME}`,
  trailingSlash: 'always',
  build: {
    // prevents problems with trailing slash redirects (SEO issue)
    format: 'directory',
  },
  vite: {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  },
  redirects: {
    // Existing redirects
    '/edge-worker/how-to/run-on-hosted-supabase':
      '/how-to/deploy-to-supabasecom/',
    '/edge-worker/faq/': '/faq/',
    '/edge-worker/how-to/': '/faq/',
    '/edge-worker/how-to/deploy-to-supabasecom/':
      '/how-to/deploy-to-supabasecom/',
    '/edge-worker/how-to/prepare-db-string/': '/how-to/prepare-db-string/',

    // New redirects for reorganization
    '/explanations/': '/concepts/',
    '/explanations/flow-dsl/': '/concepts/flow-dsl/',
    '/explanations/comparison-to-dbos/': '/comparisons/dbos/',
    '/explanations/comparison-to-inngest/': '/comparisons/inngest/',
    '/explanations/comparison-to-trigger-dev/': '/comparisons/trigger/',
  },
  integrations: [
    react(),
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
        // starlightLlmsTxt({ exclude: ['/'] }),
        starlightLinksValidator({ exclude: ['http://localhost*'] }),
        starlightSidebarTopics([
          {
            label: 'pgflow',
            icon: 'open-book',
            link: '/getting-started/install-pgflow/',
            id: 'pgflow',
            items: [
              {
                label: 'START HERE',
                autogenerate: { directory: 'getting-started/' },
              },
              {
                label: 'CONCEPTS',
                autogenerate: { directory: 'concepts/', collapsed: true },
              },
              {
                label: 'COMPARISONS',
                autogenerate: { directory: 'comparisons/', collapsed: true },
              },
              {
                label: 'HOW TO',
                autogenerate: { directory: 'how-to/', collapsed: true },
              },
              {
                label: 'TUTORIALS',
                autogenerate: { directory: 'tutorials/', collapsed: true },
              },
              {
                label: 'FAQ - Common Questions',
                link: '/faq/',
              },
            ],
          },
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
                label: 'How To',
                items: [
                  {
                    label: 'Deploy to Supabase.com',
                    link: '/how-to/deploy-to-supabasecom/',
                  },
                  {
                    label: 'Prepare DB Connection String',
                    link: '/how-to/prepare-db-string/',
                  },
                ],
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
      social: [
        { icon: 'github', label: 'GitHub', href: GITHUB_REPO_URL },
        {
          icon: 'twitter',
          label: 'X/Twitter',
          href: 'https://x.com/pgflow_dev',
        },
        { icon: 'discord', label: 'Discord', href: DISCORD_INVITE_URL },
      ],
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
