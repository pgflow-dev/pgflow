import { RunnableLambda } from '@langchain/core/runnables';

export function debug(label: string) {
	return new RunnableLambda({
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		func(input: any) {
			console.log(`DEBUG '${label}': `, input);
			return input;
		}
	});
}
