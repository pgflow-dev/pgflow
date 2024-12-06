<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import type { Json } from '$backend/types';

	export let result: Json;
</script>

<Tooltip.Root>
	<Tooltip.Trigger asChild let:builder>
		<Button builders={[builder]} size="sm" variant="outline">results</Button>
	</Tooltip.Trigger>
	<Tooltip.Content>
		<pre><code>{JSON.stringify(result, null, 2)}</code></pre>
	</Tooltip.Content>
</Tooltip.Root>
