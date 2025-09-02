// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightBlog from 'starlight-blog';
import starlightLinksValidator from 'starlight-links-validator';
import starlightSidebarTopics from 'starlight-sidebar-topics';
import robotsTxt from 'astro-robots-txt';
import starlightLlmsTxt from 'starlight-llms-txt';
import { fileURLToPath } from 'url';
import path from 'path';

import react from '@astrojs/react';

const GITHUB_REPO_URL = 'https://github.com/pgflow-dev/pgflow';
const DISCORD_INVITE_URL = 'https://pgflow.dev/discord/';
const EMAIL_URL = 'mailto:hello@pgflow.dev';
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

  // Static output for Cloudflare Pages - no SSR, no Workers bundle
  output: 'static',

  build: {
    // prevents problems with trailing slash redirects (SEO issue)
    format: 'directory',
  },

  vite: {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        // Safety net: use edge-safe React renderer if SSR bundle is generated
        ...(process.env.NODE_ENV === 'production' && {
          'react-dom/server': 'react-dom/server.edge',
        }),
      },
    },
    envPrefix: ['VITE_'],
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

    // File rename redirects
    '/how-to/version-your-flows/': '/how-to/version-flows/',

    // New redirects for reorganization
    '/explanations/': '/concepts/',
    '/explanations/flow-dsl/': '/concepts/flow-dsl/',
    '/explanations/comparison-to-dbos/': '/comparisons/dbos/',
    '/explanations/comparison-to-inngest/': '/comparisons/inngest/',
    '/explanations/comparison-to-trigger-dev/': '/comparisons/trigger/',

    // Redirects for comparisons to vs rename
    '/comparisons/': '/vs/',
    '/comparisons/dbos/': '/vs/dbos/',
    '/comparisons/inngest/': '/vs/inngest/',
    '/comparisons/trigger/': '/vs/trigger/',
  },

  integrations: [
    react({
      include: ['**/components/**/*.tsx'],
      exclude: ['**/pages/**/*'],
      experimentalReactChildren: true,
      // Disable React streaming = smaller client bundle, no SSR helpers
      experimentalDisableStreaming: true,
    }),
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
        {
          tag: 'meta',
          attrs: {
            property: 'og:image',
            content: `https://${DOMAIN_NAME}/og-image.jpg`,
          },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'twitter:image',
            content: `https://${DOMAIN_NAME}/og-image.jpg`,
          },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:type',
            content: 'website',
          },
        },
      ],
      plugins: [
        starlightBlog({
          prefix: 'news',
          title: 'News',
          authors: {
            jumski: {
              name: 'Wojciech Majewski (@jumski)',
              title: 'Creator and Maintainer',
              picture: '/jumski-avatar.png',
              url: 'https://github.com/jumski',
            },
          },
          navigation: 'header-end', // Show news link in navigation
          postCount: 10,
          recentPostCount: 5,
          metrics: {
            readingTime: true,
          },
        }),
        starlightLlmsTxt({
          exclude: [
            'index',
            '**/index',
            'tutorials/ai-web-scraper/*',
            'how-to/naming-steps',
            'how-to/update-flow-options',
            'faq',
            'news/**',
            'hire/**',
          ],
          promote: [
            'getting-started/install-pgflow',
            'getting-started/create-first-flow',
            'getting-started/compile-to-sql',
            'getting-started/run-flow',
            'concepts/how-pgflow-works',
            'concepts/flow-dsl',
            'how-to/create-reusable-tasks',
            'how-to/monitor-flow-execution',
            'how-to/version-flows',
            'how-to/organize-flows-code',
          ],
          demote: [
            'edge-worker/*',
            'vs/*',
            'how-to/deploy-to-supabasecom',
            'how-to/manual-installation',
            'how-to/prepare-db-string',
            'how-to/prune-old-records',
            'how-to/delete-flow-and-data',
          ],
        }),
        starlightLinksValidator({ exclude: ['http://localhost*'] }),
        starlightSidebarTopics(
          [
            {
              label: 'Hire the Author',
              icon: 'email',
              link: '/hire/',
              id: 'hire',
            },
            {
              label: 'News',
              icon: 'pen',
              link: '/news/',
              id: 'news',
              items: [
                {
                  label: 'All Posts',
                  link: '/news/',
                },
              ],
            },
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
                  label: 'TUTORIALS',
                  collapsed: true,
                  items: [
                    {
                      label: 'AI Web Scraper',
                      autogenerate: {
                        directory: 'tutorials/ai-web-scraper/',
                        collapsed: true,
                      },
                    },
                  ],
                },
                {
                  label: 'HOW TO',
                  collapsed: true,
                  autogenerate: { directory: 'how-to/' },
                },
                {
                  label: 'CONCEPTS',
                  badge: { text: 'NEW!', variant: 'tip' },
                  collapsed: true,
                  autogenerate: { directory: 'concepts/' },
                },
                {
                  label: 'COMPARISONS',
                  collapsed: true,
                  autogenerate: { directory: 'vs/' },
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
          ],
          {
            exclude: ['/hire', '/demos'],
            topics: {
              news: ['/news', '/news/**/*']
            },
          }
        ),
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
        { icon: 'email', label: 'Contact author', href: EMAIL_URL },
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

  // No adapter needed for static output - Cloudflare Pages serves dist/ automatically
});
