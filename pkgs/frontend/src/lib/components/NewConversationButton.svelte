<script lang="ts">
	import { goto } from '$app/navigation';
	import { v4 as uuidv4 } from 'uuid';

	async function gotoNewConversationId() {
		const newConversationId = uuidv4();

		goto(`/conversations/${newConversationId}`);
	}
</script>

<button on:click={gotoNewConversationId} class="btn btn-sm text-xs variant-filled-primary">
	+ New conversation
</button>
