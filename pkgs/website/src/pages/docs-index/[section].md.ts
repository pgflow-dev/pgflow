import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { renderSectionIndex, SECTIONS } from '../../utils/docs-index';

export function getStaticPaths() {
  return SECTIONS.map((section) => ({ params: { section: section.id } }));
}

export const GET: APIRoute = async ({ site, params }) => {
  const section = SECTIONS.find((s) => s.id === params.section);
  if (!section) return new Response('Not found', { status: 404 });

  const base = (site ?? new URL('https://www.pgflow.dev')).toString().replace(/\/+$/, '');
  const docs = await getCollection('docs');
  return new Response(renderSectionIndex(base, section, docs), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
