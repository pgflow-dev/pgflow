<script lang="ts">
	import ChatLayout from '$components/ChatLayout.svelte';
	import { Avatar } from '@skeletonlabs/skeleton';
	import Prompt from '$components/Prompt.svelte';

	let currentMessage = '';

	const LOREM = `Lorem ipsum dolor sit amet consectetur adipisicing elit. Repellat, voluptate. Lorem ipsum dolor
	sit amet consectetur adipisicing elit. Lorem ipsum dolor sit amet consectetur adipisicing elit.
	Repellat, voluptate. Lorem ipsum dolor sit amet consectetur adipisicing elit. Lorem ipsum dolor
	sit amet consectetur adipisicing elit. Repellat, voluptate. Lorem ipsum dolor sit amet consectetur
	adipisicing elit. Lorem ipsum dolor sit amet consectetur adipisicing elit. Repellat, voluptate.
	Lorem ipsum dolor sit amet consectetur adipisicing elit. Lorem ipsum dolor sit amet consectetur
	adipisicing elit. Repellat, voluptate. Lorem ipsum dolor sit amet consectetur adipisicing elit.
	Lorem ipsum dolor sit amet consectetur adipisicing elit. Repellat, voluptate. Lorem ipsum dolor
	sit amet consectetur adipisicing elit. Lorem ipsum dolor sit amet consectetur adipisicing elit.
	Repellat, voluptate. Lorem ipsum dolor sit amet consectetur adipisicing elit. Lorem ipsum dolor
	sit amet consectetur adipisicing elit. Repellat, voluptate. Lorem ipsum dolor sit amet consectetur
	adipisicing elit.`;
</script>

<ChatLayout>
	<svelte:fragment slot="messages">
		<div class="w-full p-4 bg-surface-500 rounded-xl m-2 text-justify">
			<div class="font-bold flex items-center mb-2">
				<Avatar width="w-4" name="You" class="mr-4" />
				You
			</div>
			{LOREM}
		</div>
		<div class="w-full p-4 bg-surface-700 rounded-xl m-2 text-justify">
			<div class="font-bold flex items-center">
				<Avatar width="w-4" name="Assistant" class="mr-4" />
				Assistant
			</div>
			{LOREM}
		</div>
		<div class="w-full p-4 bg-surface-500 rounded-xl m-2 text-justify">
			<div class="font-bold flex items-center mb-2">
				<Avatar width="w-4" name="You" class="mr-4" />
				You
			</div>
			{LOREM}
		</div>
		<div class="w-full p-4 bg-surface-700 rounded-xl m-2 text-justify">
			<div class="font-bold flex items-center">
				<Avatar width="w-4" name="Assistant" class="mr-4" />
				Assistant
			</div>
			{LOREM}
		</div>
	</svelte:fragment>

	<svelte:fragment slot="prompt">
		<Prompt label="send" placeholder="ask a question" value={currentMessage} />
	</svelte:fragment>
</ChatLayout>
