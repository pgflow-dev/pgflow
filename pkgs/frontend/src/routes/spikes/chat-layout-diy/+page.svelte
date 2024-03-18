<script lang="ts">
	import { Avatar } from '@skeletonlabs/skeleton';
	import Prompt from '$components/Prompt.svelte';

	let currentMessage = '';
</script>

<div class="flex flex-col h-full justify-center p-6">
	<div class="flex-grow w-[75vw] mx-auto">
		<div class="w-full p-4 bg-surface-500 rounded-xl m-2">
			<div class="h4 flex items-center">
				<Avatar width="w-8" name="You" class="mr-4" />
				You
			</div>
			Lorem ipsum dolor sit amet consectetur adipisicing elit. Repellat, voluptate. Lorem ipsum dolor
			sit amet consectetur adipisicing elit.
		</div>
		<div class="w-full p-4 bg-surface-700 rounded-xl m-2">
			<div class="h4 flex items-center">
				<Avatar width="w-8" name="Assistant" class="mr-4" />
				Assistant
			</div>
			Lorem ipsum dolor sit amet consectetur adipisicing elit. Repellat, voluptate. Lorem ipsum dolor
			sit amet consectetur adipisicing elit.
		</div>
	</div>

	<div class="mx-auto w-[75vw] border border-red-400">
		<Prompt label="send" placeholder="ask a question" value={currentMessage} />
	</div>
</div>
