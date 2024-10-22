<script lang="ts">
	import type { Entity } from '$lib/db/feed';

	export let entity: Entity;

	import EventComponent from './EventComponent.svelte';
	import TodoComponent from './TodoComponent.svelte';
	import NoteComponent from './NoteComponent.svelte';
	import CodeSnippetComponent from './CodeSnippetComponent.svelte';
	import BookmarkComponent from './BookmarkComponent.svelte';
	import PersonComponent from './PersonComponent.svelte';
</script>

{#if entity.type == 'event'}
	<EventComponent event={entity} />
{:else if entity.type == 'todo'}
	<TodoComponent todo={entity} />
{:else if entity.type == 'note'}
	<NoteComponent note={entity} />
{:else if entity.type == 'code_snippet'}
	<CodeSnippetComponent code_snippet={entity} />
{:else if entity.type == 'bookmark'}
	<BookmarkComponent bookmark={entity} />
{:else if entity.type == 'person'}
	<PersonComponent person={entity} />
{/if}
