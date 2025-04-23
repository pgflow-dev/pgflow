import { Flow } from 'npm:@pgflow/dsl@0.1.5';

export default new Flow<number>({ slug: 'sequential' }).step(
  { slug: 'step1' },
  ({ run }) => run + 1
);
