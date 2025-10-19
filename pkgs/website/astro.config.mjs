// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightBlog from 'starlight-blog';
import starlightLinksValidator from 'starlight-links-validator';
import starlightSidebarTopics from 'starlight-sidebar-topics';
import robotsTxt from 'astro-robots-txt';
import starlightLlmsTxt from 'starlight-llms-txt';
import starlightContextualMenu from 'starlight-contextual-menu';
import d2 from 'astro-d2';
import { fileURLToPath } from 'url';
import path from 'path';

import react from '@astrojs/react';
import { redirects } from './redirects.config.mjs';

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

  redirects,

  integrations: [
    d2(),
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
        starlightContextualMenu({
          actions: ['copy', 'view', 'chatgpt', 'claude'],
        }),
        starlightLlmsTxt({
          exclude: [
            'index',
            // Navigation-only index files (pure CardGrid hubs with no unique content)
            'build/index',
            'concepts/index',
            'deploy/index',
            'reference/index',
            'tutorials/index',
            'comparisons/index',
            // Tutorials (lengthy, patterns covered elsewhere)
            'tutorials/ai-web-scraper/*',
            // News/blog and non-technical content
            'news/**',
            'hire/**',
            'author/**',
            // Note: The following index files ARE included because they have valuable content:
            // - build/starting-flows/index (comparison guide for starting flows)
            // - reference/configuration/index (config philosophy and structure)
          ],
          promote: [
            'get-started/installation',
            'get-started/flows/create-flow',
            'get-started/flows/compile-flow',
            'get-started/flows/run-flow',
            'concepts/how-pgflow-works',
            'concepts/data-model',
            'concepts/understanding-flows',
            'build/create-reusable-tasks',
            'deploy/monitor-execution',
            'build/version-flows',
            'build/organize-flow-code',
          ],
          demote: [
            'edge-worker/*',
            'reference/queue-worker/*',
            'comparisons/*',
            'deploy/supabase/deploy-first-flow',
            'deploy/supabase/update-deployed-flows',
            'reference/manual-installation',
            'deploy/connection-string',
            'deploy/prune-records',
            'build/delete-flows',
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
              label: 'Build',
              icon: 'pencil',
              link: '/build/',
              id: 'build',
              items: [
                { label: 'Overview', link: '/build/' },
                {
                  label: 'Writing Flows',
                  items: [
                    {
                      label: 'Organize flow code',
                      link: '/build/organize-flow-code/',
                    },
                    {
                      label: 'Retrying steps',
                      link: '/build/retrying-steps/',
                    },
                    {
                      label: 'Validation steps',
                      link: '/build/validation-steps/',
                    },
                    {
                      label: 'Delaying steps',
                      link: '/build/delaying-steps/',
                    },
                    {
                      label: 'Create reusable tasks',
                      link: '/build/create-reusable-tasks/',
                    },
                    {
                      label: 'Process arrays in parallel',
                      link: '/build/process-arrays-in-parallel/',
                    },
                  ],
                },
                {
                  label: 'Starting Flows',
                  autogenerate: { directory: 'build/starting-flows/' },
                },
                {
                  label: 'Flow Management',
                  items: [
                    { label: 'Version flows', link: '/build/version-flows/' },
                    { label: 'Delete flows', link: '/build/delete-flows/' },
                  ],
                },
              ],
            },
            {
              label: 'Deploy',
              icon: 'cloud-download',
              link: '/deploy/',
              id: 'deploy',
              items: [
                { label: 'Overview', link: '/deploy/' },
                {
                  label: 'Supabase',
                  autogenerate: { directory: 'deploy/supabase/' },
                },
                {
                  label: 'Observe',
                  items: [
                    {
                      label: 'Monitor flow execution',
                      link: '/deploy/monitor-execution/',
                    },
                    {
                      label: 'Monitor workers health',
                      link: '/deploy/monitor-workers-health/',
                    },
                  ],
                },
                {
                  label: 'Maintain',
                  items: [
                    {
                      label: 'Connection string encoding',
                      link: '/deploy/connection-string/',
                    },
                    { label: 'Prune records', link: '/deploy/prune-records/' },
                    {
                      label: 'Tune deployed flows',
                      link: '/deploy/tune-flow-config/',
                    },
                    { label: 'Update pgflow', link: '/deploy/update-pgflow/' },
                  ],
                },
              ],
            },
            {
              label: 'Concepts',
              icon: 'puzzle',
              link: '/concepts/',
              id: 'concepts',
              items: [
                { label: 'Overview', link: '/concepts/' },
                {
                  label: 'Architecture',
                  items: [
                    {
                      label: 'How pgflow works',
                      link: '/concepts/how-pgflow-works/',
                    },
                    {
                      label: 'Three-layer architecture',
                      link: '/concepts/three-layer-architecture/',
                    },
                    { label: 'Data model', link: '/concepts/data-model/' },
                  ],
                },
                {
                  label: 'Defining Flows',
                  items: [
                    {
                      label: 'Understanding flows',
                      link: '/concepts/understanding-flows/',
                    },
                    { label: 'Map steps', link: '/concepts/map-steps/' },
                    {
                      label: 'Context object',
                      link: '/concepts/context-object/',
                    },
                    { label: 'Naming steps', link: '/concepts/naming-steps/' },
                  ],
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
                  label: 'Security',
                  items: [
                    { label: 'Permissions', link: '/reference/permissions/' },
                  ],
                },
                {
                  label: 'Configuration',
                  autogenerate: { directory: 'reference/configuration/' },
                },
                {
                  label: 'APIs',
                  items: [
                    {
                      label: '@pgflow/client API',
                      link: '/reference/pgflow-client/',
                    },
                    { label: 'Context API', link: '/reference/context/' },
                    { label: 'Compile API', link: '/reference/compile-api/' },
                    {
                      label: 'Manual installation',
                      link: '/reference/manual-installation/',
                    },
                  ],
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
              icon: 'random',
              link: '/comparisons/',
              id: 'comparisons',
              items: [
                { label: 'Overview', link: '/comparisons/' },
                { label: 'DBOS', link: '/comparisons/dbos/' },
                { label: 'Inngest', link: '/comparisons/inngest/' },
                { label: 'Trigger.dev', link: '/comparisons/trigger/' },
              ],
            },
          ],
          {
            exclude: [
              '/author',
              '/demos',
              '/demo-colors',
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
