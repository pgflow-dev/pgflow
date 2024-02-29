<script lang="ts">
	import { Avatar } from '@skeletonlabs/skeleton';
	import type { ChatMessage } from '$lib/chatTypes';

	export let currentMessage: string;
	export let messages: ChatMessage[] = [];
</script>

<div class="h-full grid grid-rows-[1fr_auto] gap-1">
	<div class="bg-surface-500/30 p-4 overflow-y-auto">
		<section class="w-full max-h-[400px] p-4 overflow-y-auto space-y-4">
			{#each messages as bubble}
				{#if bubble.host === true}
					<div class="grid grid-cols-[auto_1fr] gap-2">
						<Avatar src="https://i.pravatar.cc/?img={bubble.avatar}" width="w-12" />
						<div class="card p-4 variant-soft rounded-tl-none space-y-2">
							<header class="flex justify-between items-center">
								<p class="font-bold">{bubble.name}</p>
								<small class="opacity-50">{bubble.timestamp}</small>
							</header>
							<p>{bubble.message}</p>
						</div>
					</div>
				{:else}
					<div class="grid grid-cols-[1fr_auto] gap-2">
						<div class="card p-4 rounded-tr-none space-y-2 {bubble.color}">
							<header class="flex justify-between items-center">
								<p class="font-bold">{bubble.name}</p>
								<small class="opacity-50">{bubble.timestamp}</small>
							</header>
							<p>{bubble.message}</p>
						</div>
						<Avatar src="https://i.pravatar.cc/?img={bubble.avatar}" width="w-12" />
					</div>
				{/if}
			{/each}
		</section>
	</div>
	<div class="bg-surface-500/30 p-4">
		<div class="input-group input-group-divider grid-cols-[auto_1fr_auto] rounded-container-token">
			<button class="input-group-shim">+</button>
			<textarea
				bind:value={currentMessage}
				class="bg-transparent border-0 ring-0"
				name="prompt"
				id="prompt"
				placeholder="Write a message..."
				rows="1"
			/>
			<button class="variant-filled-primary">Send</button>
		</div>
	</div>
</div>
