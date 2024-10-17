<script lang="ts">
	import { Textarea } from '$components/ui/textarea';
	import type { InferredFeedShareRow, Entity } from '$lib/db/feed';
	import { writable } from 'svelte/store';
	import UiComponent from '$components/ui/Component.svelte';
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { expoOut } from 'svelte/easing';
	import type {
		RealtimePostgresDeletePayload,
		RealtimePostgresInsertPayload
	} from '@supabase/supabase-js';
	import { createSupabaseEntityStore } from '$lib/stores/supabaseEntityStore';
	import EntityComponent from '$components/feed/EntityComponent.svelte';
	import { enhance } from '$app/forms';

	export let data;

	let { supabase } = data;
	$: ({ supabase } = data);

	const shares = writable<InferredFeedShareRow[]>([]);
	const { entities, upsertEntity } = createSupabaseEntityStore<Entity>([]);

	function handleUpdateShare(payload: { new: InferredFeedShareRow }) {
		console.log('handleUpdateShare', payload);

		const { new: share } = payload;
		const index = $shares.findIndex((n) => n.id === share.id);

		// if there is share in $shares with same id, replace its attributes
		if (index !== -1) {
			$shares = [
				...$shares.slice(0, index),
				{ ...$shares[index], ...share },
				...$shares.slice(index + 1)
			];
		} else {
			$shares = [share, ...$shares];
		}
	}

	function handleDeleteShare(payload: RealtimePostgresDeletePayload<InferredFeedShareRow>) {
		console.log('handleDeleteShare', payload);

		const { old: deleted } = payload;
		$shares = $shares.filter((n) => n.id !== deleted.id);
	}

	onMount(async () => {
		const eventSpec = {
			schema: 'feed',
			table: 'shares'
		};

		supabase
			.channel('schema-db-changes')
			.on('postgres_changes', { event: 'INSERT', ...eventSpec }, handleUpdateShare)
			.on('postgres_changes', { event: 'UPDATE', ...eventSpec }, handleUpdateShare)
			.on('postgres_changes', { event: 'DELETE', ...eventSpec }, handleDeleteShare)
			.on(
				'postgres_changes',
				{ event: 'INSERT', schema: 'feed' },
				(payload: RealtimePostgresInsertPayload<Entity>) => {
					if (payload.table != 'shares') {
						upsertEntity(payload.new);
					}
				}
			)
			.subscribe();

		const response = await supabase
			.schema('feed')
			.from('shares')
			.select('*')
			.order('created_at', { ascending: false })
			.limit(25);

		if (response.data && !response.error) {
			shares.set(response.data);
		} else {
			console.log('error', response.error);
		}
	});

	const textareaValue = writable('');
	function handlePaste(event: KeyboardEvent) {
		if (event.ctrlKey && event.key === 'v') {
			event.preventDefault();
			navigator.clipboard.readText().then((text) => {
				textareaValue.set(text);
			});
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.ctrlKey && event.key === 'Enter') {
			event.preventDefault();
			const target = event.target as HTMLElement;
			const form = target?.closest('form');
			if (form) {
				form.requestSubmit();
			}
		}
	}
</script>

<svelte:window on:keydown={handlePaste} />

<div class="col-span-12 relative">
	<form method="POST" use:enhance action="/feed/add-share" class="relative">
		<Textarea
			name="content"
			class="textarea w-full min-h-[100px] pr-24"
			on:keydown={handleKeydown}
			bind:value={$textareaValue}
		/>

		<input type="hidden" name="__source" value="webapp" />

		<button
			type="submit"
			class="btn btn-xs text-xs p-1 variant-soft-primary absolute bottom-2 right-2"
		>
			Add Share
		</button>
	</form>
</div>

<div class="col-span-12 gap-2 space-y-2">
	{#each $shares as share (share.id)}
		<div animate:flip={{ duration: 300, easing: expoOut }}>
			{#if $entities.get(share.id)}
				<div transition:slide={{ duration: 300 }} class="my-8">
					{#each $entities.get(share.id) || [] as entity (entity.id)}
						<div transition:slide={{ duration: 300 }}>
							<EntityComponent {entity} />
						</div>
					{/each}
				</div>
			{:else}
				<div transition:slide={{ duration: 300 }} class="opacity-25">
					<UiComponent {share} entities={[]} />
				</div>
			{/if}
		</div>
	{/each}
</div>
