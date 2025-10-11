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
    // Route rename
    '/hire/': '/author/',

    // Page rename redirects
    '/concepts/array-and-map-steps/': '/concepts/map-steps/',

    // Get Started reorganization
    '/get-started/': '/get-started/installation/',
    '/getting-started/': '/get-started/',
    '/getting-started/install-pgflow/': '/get-started/installation/',
    '/getting-started/create-first-flow/': '/get-started/flows/create-flow/',
    '/getting-started/compile-to-sql/': '/get-started/flows/compile-flow/',
    '/getting-started/run-flow/': '/get-started/flows/run-flow/',
    '/getting-started/update-pgflow/': '/operate/maintain/update-pgflow/',
    '/getting-started/configuration/': '/reference/configuration/configuration/',

    // Edge Worker reorganization
    '/edge-worker/getting-started/create-first-worker/':
      '/get-started/background-jobs/create-worker/',
    '/edge-worker/getting-started/install-edge-worker/':
      '/get-started/installation/',
    '/edge-worker/how-to/run-on-hosted-supabase/':
      '/operate/deploy/deploy-first-flow/',
    '/edge-worker/faq/': '/get-started/faq/',
    '/edge-worker/how-to/': '/get-started/faq/',
    '/edge-worker/how-to/deploy-to-supabasecom/':
      '/operate/deploy/deploy-first-flow/',
    '/edge-worker/how-to/prepare-db-string/': '/operate/maintain/connection-string/',

    // FAQ move
    '/faq/': '/get-started/faq/',

    // How-to → Develop/Operate reorganization
    '/how-to/': '/develop/',
    '/how-to/batch-process-with-map/': '/develop/authoring/process-arrays-in-parallel/',
    '/how-to/create-reusable-tasks/': '/develop/authoring/create-reusable-tasks/',
    '/how-to/monitor-flow-execution/': '/operate/observe/monitor-execution/',
    '/how-to/naming-steps/': '/concepts/flows/naming-steps/',
    '/how-to/organize-flows-code/': '/develop/authoring/organize-flow-code/',
    '/how-to/version-flows/': '/develop/version-flows/',
    '/how-to/version-your-flows/': '/develop/version-flows/',
    '/develop/manage/version-flows/': '/develop/version-flows/',
    '/how-to/update-flow-options/': '/operate/maintain/tune-flow-config/',
    '/develop/config-tuning/update-flow-options/': '/operate/maintain/tune-flow-config/',
    '/develop/manage/update-flow-options/': '/operate/maintain/tune-flow-config/',
    '/how-to/delete-flow-and-data/': '/develop/delete-flows/',
    '/develop/manage/delete-flows/': '/develop/delete-flows/',
    '/how-to/manually-compile-flow/': '/reference/apis/compile-api/',
    '/how-to/deploy-to-supabasecom/': '/operate/deploy/deploy-first-flow/',
    '/how-to/keep-workers-up/': '/operate/deploy/keep-workers-running/',
    '/operate/deploy/deploy-to-supabase/': '/operate/deploy/update-deployed-flows/',
    '/how-to/prepare-db-string/': '/operate/maintain/connection-string/',
    '/how-to/prune-old-records/': '/operate/maintain/prune-records/',
    '/how-to/manual-installation/': '/reference/apis/manual-installation/',

    // Explanations to Concepts/Comparisons
    '/explanations/': '/concepts/overview/',
    '/explanations/flow-dsl/': '/concepts/flows/understanding-flows/',
    '/explanations/comparison-to-dbos/': '/comparisons/dbos/',
    '/explanations/comparison-to-inngest/': '/comparisons/inngest/',
    '/explanations/comparison-to-trigger-dev/': '/comparisons/trigger/',

    // Comparisons rename (vs → comparisons)
    '/vs/': '/comparisons/',
    '/vs/dbos/': '/comparisons/dbos/',
    '/vs/inngest/': '/comparisons/inngest/',
    '/vs/trigger/': '/comparisons/trigger/',

    // Edge Worker → Reference/Queue Worker
    '/edge-worker/getting-started/configuration/': '/reference/queue-worker/configuration/',
    '/edge-worker/how-it-works/': '/reference/queue-worker/how-it-works/',
    '/edge-worker/getting-started/observability/': '/operate/observe/monitor-workers-health/',

    // Concepts reorganization
    '/concepts/': '/concepts/overview/',
    '/concepts/flow-dsl/': '/concepts/flows/understanding-flows/',
    '/concepts/map-steps/': '/concepts/flows/map-steps/',
    '/concepts/context/': '/concepts/flows/context/',
    '/concepts/how-pgflow-works/': '/concepts/architecture/how-pgflow-works/',
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
        {
          tag: 'script',
          content: `
            document.addEventListener('DOMContentLoaded', function() {
              if (!window.location.pathname.startsWith('/author')) {
                const sticker = document.createElement('a');
                sticker.href = '/author/';
                sticker.className = 'hire-sticker';
                sticker.textContent = 'Chat with Author';
                document.body.appendChild(sticker);

                // Trigger one-time attention nudge after 5 seconds
                setTimeout(function() {
                  sticker.classList.add('nudge');
                  // Remove the class after animation completes
                  setTimeout(function() {
                    sticker.classList.remove('nudge');
                  }, 800);
                }, 5000);
              }
            });
          `,
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
            'concepts/flows/naming-steps',
            'operate/maintain/tune-flow-config',
            'get-started/faq',
            'news/**',
            'hire/**',
          ],
          promote: [
            'get-started/installation',
            'get-started/flows/create-flow',
            'get-started/flows/compile-flow',
            'get-started/flows/run-flow',
            'concepts/overview/how-pgflow-works',
            'concepts/flows/understanding-flows',
            'develop/authoring/create-reusable-tasks',
            'operate/observe/monitor-execution',
            'develop/version-flows',
            'develop/authoring/organize-flow-code',
          ],
          demote: [
            'edge-worker/*',
            'reference/queue-worker/*',
            'comparisons/*',
            'operate/deploy/deploy-first-flow',
            'operate/deploy/update-deployed-flows',
            'reference/apis/manual-installation',
            'operate/maintain/connection-string',
            'operate/maintain/prune-records',
            'develop/delete-flows',
            'project-status',
          ],
        }),
        starlightLinksValidator({ exclude: ['http://localhost*'] }),
        starlightSidebarTopics(
          [
            {
              label: 'Get Started',
              icon: 'rocket',
              link: '/get-started/installation/',
              id: 'get-started',
              items: [
                { label: 'Installation', link: '/get-started/installation/' },
                {
                  label: 'Flows',
                  autogenerate: { directory: 'get-started/flows/' },
                },
                {
                  label: 'Background Jobs',
                  autogenerate: { directory: 'get-started/background-jobs/' },
                },
                { label: 'FAQ', link: '/get-started/faq/' },
                { label: 'Project Status', link: '/project-status/' },
              ],
            },
            {
              label: 'Develop',
              icon: 'puzzle',
              link: '/develop/',
              id: 'develop',
              items: [
                { label: 'Overview', link: '/develop/' },
                {
                  label: 'Authoring',
                  autogenerate: { directory: 'develop/authoring/' },
                },
                { label: 'Version flows', link: '/develop/version-flows/' },
                { label: 'Delete flows', link: '/develop/delete-flows/' },
              ],
            },
            {
              label: 'Operate',
              icon: 'setting',
              link: '/operate/',
              id: 'operate',
              items: [
                { label: 'Overview', link: '/operate/' },
                {
                  label: 'Deploy',
                  autogenerate: { directory: 'operate/deploy/' },
                },
                {
                  label: 'Observe',
                  autogenerate: { directory: 'operate/observe/' },
                },
                {
                  label: 'Maintain',
                  autogenerate: { directory: 'operate/maintain/' },
                },
              ],
            },
            {
              label: 'Concepts',
              icon: 'information',
              link: '/concepts/',
              id: 'concepts',
              items: [
                { label: 'Overview', link: '/concepts/overview/' },
                {
                  label: 'Architecture',
                  autogenerate: { directory: 'concepts/architecture/' },
                },
                {
                  label: 'Defining Flows',
                  autogenerate: { directory: 'concepts/flows/' },
                },
              ],
            },
            {
              label: 'Reference',
              icon: 'document',
              link: '/reference/',
              id: 'reference',
              items: [
                { label: 'Overview', link: '/reference/' },
                {
                  label: 'Configuration',
                  autogenerate: { directory: 'reference/configuration/' },
                },
                {
                  label: 'APIs',
                  autogenerate: { directory: 'reference/apis/' },
                },
                {
                  label: 'Queue Worker',
                  autogenerate: { directory: 'reference/queue-worker/' },
                },
              ],
            },
            {
              label: 'Tutorials',
              icon: 'open-book',
              link: '/tutorials/',
              id: 'tutorials',
              items: [
                {
                  label: 'AI Web Scraper',
                  autogenerate: {
                    directory: 'tutorials/ai-web-scraper/',
                  },
                },
              ],
            },
            {
              label: 'Comparisons',
              icon: 'approve-check',
              link: '/comparisons/',
              id: 'comparisons',
              items: [
                {
                  label: 'Comparisons',
                  autogenerate: { directory: 'comparisons/' },
                },
              ],
            },
          ],
          {
            exclude: [
              '/author',
              '/demos',
              '/news',
              '/news/**',
              '/edge-worker',
              '/edge-worker/**',
              '/project-status',
            ],
            topics: {},
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
