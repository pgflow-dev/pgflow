<<<<<<< Updated upstream
import { RunnableLambda } from '@langchain/core/runnables';

export function debug(label: string) {
	return new RunnableLambda({
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		func(input: any) {
			console.log(label, input);
			return input;
		}
	});
}
||||||| Stash base
=======
import { RunnableLambda } from '@langchain/core/runnables';

function debug(label: string) {
	return new RunnableLambda({
		func(input: any) {
			console.log(label, input);
			return input;
		}
	});
}
>>>>>>> Stashed changes
