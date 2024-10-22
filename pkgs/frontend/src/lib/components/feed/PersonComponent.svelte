<script lang="ts">
	import type { Person } from '$lib/db/feed';
	import { User } from 'lucide-svelte';

	export let person: Person;
</script>

<div class="break-inside-avoid p-4 flex items-center border border-gray-600">
	<User size={48} class="mr-4" />
	<div>
		<h2 class="text-xl font-bold">{person.name_or_nickname}</h2>
		{#if person.gender}
			<p>Gender: {person.gender}</p>
		{/if}
		{#if person.occupation}
			<p>Occupation: {person.occupation}</p>
		{/if}
		{#if person.relation_to_user}
			<p>Relation: {person.relation_to_user}</p>
		{/if}
	</div>
</div>
