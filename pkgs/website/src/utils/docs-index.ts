import type { CollectionEntry } from 'astro:content';

type Doc = CollectionEntry<'docs'>;

export interface Section {
  /** Top-level docs collection id prefix. Also the /docs-index/<id>.md file name. */
  id: string;
  label: string;
  /** One-line, task-oriented routing hint used in /docs-index.md. */
  route: string;
}

/**
 * Section allowlist. Only these top-level sections are indexed, so drafts,
 * internal pages (edge-worker, author, demos) and root one-offs never leak
 * into the generated indexes.
 */
export const SECTIONS: Section[] = [
  {
    id: 'get-started',
    label: 'Get Started',
    route: 'Install pgflow, run your first flow, background jobs mode, FAQ.',
  },
  {
    id: 'build',
    label: 'Build',
    route: 'Author flows: steps, dependencies, conditional execution, retries, starting flows, versioning.',
  },
  {
    id: 'deploy',
    label: 'Deploy',
    route: 'Deploy and operate: Supabase or Node/Bun workers, monitoring, troubleshooting, updates.',
  },
  {
    id: 'concepts',
    label: 'Concepts',
    route: 'How pgflow works: execution model, data model, compilation, worker lifecycle, architecture.',
  },
  {
    id: 'reference',
    label: 'Reference',
    route: 'APIs and configuration: @pgflow/client, context, compile APIs, permissions, worker and step settings.',
  },
  {
    id: 'tutorials',
    label: 'Tutorials',
    route: 'Hands-on guides: RAG pipelines, AI web scraper.',
  },
  {
    id: 'news',
    label: 'News',
    route: 'Release announcements — what shipped and when.',
  },
  {
    id: 'comparisons',
    label: 'Comparisons',
    route: 'pgflow vs DBOS, Inngest, Trigger.dev, Vercel Workflows.',
  },
];

/**
 * Secondary or niche pages listed under `## Optional` in their section index.
 * Matches by exact id or by `prefix/`.
 */
const OPTIONAL_PAGES = [
  'deploy/connection-string',
  'deploy/prune-records',
  'deploy/troubleshooting-connections',
  'reference/manual-installation',
  'reference/queue-worker/',
];

function sectionOf(id: string): Section | undefined {
  return SECTIONS.find((s) => id === s.id || id.startsWith(s.id + '/'));
}

/** Top-level section pages are navigation-only CardGrid hubs — skip them. */
function isNavigationHub(id: string): boolean {
  return SECTIONS.some((s) => id === s.id);
}

function isOptional(id: string): boolean {
  return OPTIONAL_PAGES.some((p) => id === p || id.startsWith(p));
}

/** Raw Markdown endpoint (starlight-markdown serves `<id>/index.md`). */
function markdownUrl(base: string, id: string): string {
  const path = id.replace(/^\/+|\/+$/g, '');
  return `${base}/${path}/index.md`;
}

function routingText(doc: Doc): string {
  const text = doc.data.agentHint ?? doc.data.description;
  if (!text) {
    throw new Error(
      `[docs-index] "${doc.id}" has no description or agentHint — every indexed page needs routing text.`
    );
  }
  return text;
}

function bySidebarOrderThenTitle(a: Doc, b: Doc): number {
  const orderA = a.data.sidebar?.order ?? Number.POSITIVE_INFINITY;
  const orderB = b.data.sidebar?.order ?? Number.POSITIVE_INFINITY;
  if (orderA !== orderB) return orderA - orderB;
  return a.data.title.localeCompare(b.data.title);
}

function byDateNewestFirst(a: Doc, b: Doc): number {
  const dateA = a.data.date?.getTime() ?? 0;
  const dateB = b.data.date?.getTime() ?? 0;
  return dateB - dateA;
}

/** Docs belonging to a section, ready for indexing: allowlisted, not draft, not a hub. */
export function sectionDocs(docs: Doc[], section: Section): Doc[] {
  return docs.filter(
    (doc) => sectionOf(doc.id) === section && !doc.data.draft && !isNavigationHub(doc.id)
  );
}

function entryLine(base: string, doc: Doc, withDate: boolean): string {
  const date = withDate && doc.data.date ? `${doc.data.date.toISOString().slice(0, 10)} — ` : '';
  return `- [${date}${doc.data.title}](${markdownUrl(base, doc.id)}) — ${routingText(doc)}`;
}

export function renderSectionIndex(base: string, section: Section, docs: Doc[]): string {
  const entries = sectionDocs(docs, section);
  const isNews = section.id === 'news';
  const primary = entries.filter((doc) => !isOptional(doc.id));
  const optional = entries.filter((doc) => isOptional(doc.id));
  primary.sort(isNews ? byDateNewestFirst : bySidebarOrderThenTitle);
  optional.sort(isNews ? byDateNewestFirst : bySidebarOrderThenTitle);

  const lines = [
    `# pgflow docs — ${section.label}`,
    '',
    section.route,
    '',
    ...primary.map((doc) => entryLine(base, doc, isNews)),
  ];
  if (optional.length > 0) {
    lines.push('', '## Optional', '', ...optional.map((doc) => entryLine(base, doc, isNews)));
  }
  return lines.join('\n') + '\n';
}

export function renderRootIndex(base: string, docs: Doc[]): string {
  const lines = [
    '# pgflow docs index',
    '',
    'Section indexes for pgflow documentation, served as raw Markdown.',
    'Core docs define current behavior and APIs; news records what shipped and when.',
    '',
    'Fetch the one section index matching your task, then only the linked pages you need.',
    'Fetch another section only when the task crosses sections or leaves a gap.',
    '',
    ...SECTIONS.filter((section) => sectionDocs(docs, section).length > 0).map(
      (section) => `- [${section.label}](${base}/docs-index/${section.id}.md) — ${section.route}`
    ),
  ];
  return lines.join('\n') + '\n';
}
