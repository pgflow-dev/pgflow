<script lang="ts">
	import ChatLayout from './ChatLayout.svelte';
	import { Textarea } from '$components/ui/textarea';
	import { Button } from '$components/ui/button';
</script>

<ChatLayout>
	yoloflaki
	<svelte:fragment slot="footer">
		<div class="relative">
			<Textarea
				class="border-none border-t border-t-gray-700 min-h-10 focus:h-72 transition-height duration-300 ease-in-out"
				placeholder="Dump your stuff here bro..."
			/>
			<Button
				variant="outline"
				class="absolute bottom-1 right-1 text-gray-600 text-sm hover:text-gray-300 size-8 px-6 rounded-none"
			>
				Save
			</Button>
		</div>
	</svelte:fragment>
</ChatLayout>
