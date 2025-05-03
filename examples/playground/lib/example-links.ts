/**
 * Common example links for website analysis
 */

export interface ExampleLink {
  url: string;
  label: string;
  variant: 'success' | 'failure';
}

export const exampleLinks: ExampleLink[] = [
  {
    url: 'https://en.wikipedia.org/wiki/PostgreSQL',
    label: 'PostgreSQL Wikipedia',
    variant: 'success',
  },
  {
    url: 'https://supabase.com/docs',
    label: 'Supabase Docs',
    variant: 'success',
  },
  {
    url: 'https://pgflow.dev',
    label: 'pgflow.dev',
    variant: 'success',
  },
  // {
  //   url: 'https://aws.amazon.com/',
  //   label: '50% failure',
  //   variant: 'failure',
  // },
  {
    url: 'https://firebase.google.com/',
    label: '100% failure',
    variant: 'failure',
  },
];
