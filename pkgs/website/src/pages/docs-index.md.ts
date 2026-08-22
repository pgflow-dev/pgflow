import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { renderRootIndex } from '../utils/docs-index';

export const GET: APIRoute = async ({ site }) => {
  const base = (site ?? new URL('https://www.pgflow.dev')).toString().replace(/\/+$/, '');
  const docs = await getCollection('docs');
  return new Response(renderRootIndex(base, docs), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
