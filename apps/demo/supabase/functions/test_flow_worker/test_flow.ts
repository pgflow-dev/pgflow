import { Flow } from '@pgflow/dsl';

export default new Flow<{ message: string }>({ slug: 'test_flow' }).step(
	{ slug: 'greet' },
	(input) => `Hello, ${input.run.message}!`
);
