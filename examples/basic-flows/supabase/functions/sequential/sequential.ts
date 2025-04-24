import { Flow } from '@pgflow/dsl';

export default new Flow<number>({ slug: 'sequential' })
  .step({ slug: 'increment' }, ({ run }) => run + 1)
  .step({ slug: 'multiply' }, ({ run }) => run * 2)
  .step(
    { slug: 'sum', dependsOn: ['multiply', 'increment'] },
    ({ increment, multiply }) => increment + multiply
  );
