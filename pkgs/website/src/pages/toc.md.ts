import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import micromatch from 'micromatch';

const BASE_URL = 'https://www.pgflow.dev';

const TOPIC_ORDER = [
  'get-started',
  'build',
  'deploy',
  'concepts',
  'reference',
  'tutorials',
  'comparisons',
];

const TOPIC_LABELS: Record<string, string> = {
  'get-started': 'Get Started',
  build: 'Build',
  deploy: 'Deploy',
  concepts: 'Concepts',
  reference: 'Reference',
  tutorials: 'Tutorials',
  comparisons: 'Comparisons',
};

const DEPRIORITIZED_PATTERNS = [
  'reference/manual-installation',
  'deploy/connection-string',
  'deploy/prune-records',
  'deploy/troubleshooting-connections',
  'reference/queue-worker/*',
  'comparisons/*',
];

function isDeprioritized(slug: string, patterns: string[]): boolean {
  return micromatch.isMatch(slug, patterns);
}

function getTopicFromSlug(slug: string): string {
  const parts = slug.split('/');
  return parts[0] || '';
}

function getDocPath(slug: string): string {
  return `${BASE_URL}/${slug}/index.md`;
}

export const GET: APIRoute = async () => {
  const docs = await getCollection('docs');

  const prioritizedDocs = docs.filter(
    (doc) => !isDeprioritized(doc.id, DEPRIORITIZED_PATTERNS)
  );
  const deprioritizedDocs = docs.filter((doc) =>
    isDeprioritized(doc.id, DEPRIORITIZED_PATTERNS)
  );

  const groupedByTopic: Record<string, typeof docs> = {};
  for (const doc of prioritizedDocs) {
    const topic = getTopicFromSlug(doc.id);
    if (!groupedByTopic[topic]) {
      groupedByTopic[topic] = [];
    }
    groupedByTopic[topic].push(doc);
  }

  const lines: string[] = [
    '# pgflow Documentation',
    '',
    'All links below are raw markdown files:',
    '',
    '```bash',
    'curl -s https://www.pgflow.dev/get-started/installation/index.md',
    '```',
    '',
  ];

  for (const topicId of TOPIC_ORDER) {
    const topicDocs = groupedByTopic[topicId];
    if (!topicDocs || topicDocs.length === 0) continue;

    const topicLabel = TOPIC_LABELS[topicId] || topicId;
    lines.push(`## ${topicLabel}`);
    lines.push('');

    const sortedDocs = [...topicDocs].sort((a, b) => {
      const aOrder = a.data.sidebar?.order ?? 999;
      const bOrder = b.data.sidebar?.order ?? 999;
      return aOrder - bOrder;
    });

    for (const doc of sortedDocs) {
      const title = doc.data.title;
      const description = doc.data.description || '';
      const path = getDocPath(doc.id);
      const line = description
        ? `- [${title}](${path}) - ${description}`
        : `- [${title}](${path})`;
      lines.push(line);
    }
    lines.push('');
  }

  if (deprioritizedDocs.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Niche / Advanced');
    lines.push('');
    lines.push(
      '> Only use these if you know what you are doing or have specific needs.'
    );
    lines.push('');

    const sortedDeprioritized = [...deprioritizedDocs].sort((a, b) => {
      const aOrder = a.data.sidebar?.order ?? 999;
      const bOrder = b.data.sidebar?.order ?? 999;
      return aOrder - bOrder;
    });

    for (const doc of sortedDeprioritized) {
      const title = doc.data.title;
      const path = getDocPath(doc.id);
      lines.push(`- [${title}](${path})`);
    }
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
};
