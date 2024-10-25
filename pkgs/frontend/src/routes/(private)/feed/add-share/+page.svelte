<script lang="ts">
	import { v4 as uuidv4 } from 'uuid';
	import ChatLayout from '$components/feed/ChatLayout.svelte';
	import Spinner from '$components/Spinner.svelte';

	import type { InferredFeedShareRow, Entity } from '$lib/db/feed';
	import { writable } from 'svelte/store';
	import { onMount, tick } from 'svelte';
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
	import { Icon } from 'svelte-awesome';
	import { save } from 'svelte-awesome/icons';
	import { shortcut } from '@svelte-put/shortcut';

	export let data;

	let { supabase } = data;
	$: ({ supabase } = data);

	let textareaElement: HTMLTextAreaElement | undefined;

	type OptimisticFeedShareRow = Pick<InferredFeedShareRow, 'id' | 'content'> &
		Partial<InferredFeedShareRow>;
	const shares = writable<OptimisticFeedShareRow[]>([]);
	const { entities, upsertEntity, upsertEntities } = createSupabaseEntityStore<Entity>([]);

	function updateShareInStore(share: OptimisticFeedShareRow) {
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

	function handleUpdateShare(payload: { new: InferredFeedShareRow }) {
		console.log('handleUpdateShare', payload);

		const { new: share } = payload;

		updateShareInStore(share);
	}

	function handleDeleteShare(payload: RealtimePostgresDeletePayload<InferredFeedShareRow>) {
		console.log('handleDeleteShare', payload);

		const { old: deleted } = payload;
		$shares = $shares.filter((n) => n.id !== deleted.id);
	}

	async function scrollToTop() {
		await tick();
		// window?.scrollTo({
		// 	top: 0,
		// 	behavior: 'instant'
		// });
	}

	$: $shares && scrollToTop();

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
						setTimeout(scrollToTop, 500);
						// scrollToTop();

						// for (let i = 1; i <= 3; i++) {
						// 	setTimeout(scrollToTop, i * 400);
						// }
					}
				}
			)
			.subscribe();

		const response = await supabase
			.schema('feed')
			.from('shares')
			.select('*, bookmarks(*), todos(*), notes(*), events(*), code_snippets(*)')
			.order('created_at', { ascending: false })
			.limit(100);

		let entitiesToUpsert: Entity[] = [];

		if (response.data && !response.error) {
			console.log('response.data (shares)', response.data);
			shares.set(response.data);

			entitiesToUpsert = response.data
				.map((share) => {
					return [
						...share.bookmarks,
						...share.notes,
						...share.events,
						...share.todos,
						...share.code_snippets
					];
				})
				.flat();
			upsertEntities(entitiesToUpsert);
		} else {
			console.log('error', response.error);
		}
	});

	const textareaValue = writable('');
	const newShareId = writable(uuidv4());
	const MAX_CHARS = 10000;

	function handleCtrlEnter(event: KeyboardEvent) {
		if (event.ctrlKey && event.key === 'Enter') {
			event.preventDefault();
			const target = event.target as HTMLElement;
			const form = target?.closest('form');
			if (form) {
				form.requestSubmit();
			}
		}
	}

	async function handleSubmit() {
		scrollToTop();

		const optimisticShare: OptimisticFeedShareRow = {
			id: $newShareId,
			content: $textareaValue
		};
		console.log('ADD optimisticShare', optimisticShare);
		console.log('ADD optimisticShare.id', optimisticShare.id);
		updateShareInStore(optimisticShare);
		// $shares = [optimisticShare, ...$shares];

		$textareaVisible = false;
		$textareaValue = '';
		$newShareId = uuidv4();
	}

	const textareaVisible = writable(false);

	$: $textareaVisible && textareaElement && textareaElement.focus();
	$: $shares && console.log('$shares', $shares);
</script>

<svelte:window
	use:shortcut={{
		trigger: {
			key: 'i',
			callback: (e) => {
				if (!(document.activeElement instanceof HTMLTextAreaElement)) {
					$textareaVisible = true;
					e.originalEvent.preventDefault();
					e.originalEvent.stopPropagation();
				}
			}
		}
	}}
/>

<ChatLayout>
	<div slot="header:bottom">
		<!-- {$newShareId} -->
		<form
			method="POST"
			use:enhance
			action="/feed/add-share"
			class="relative"
			on:submit={handleSubmit}
		>
			<input type="hidden" name="__source" value="webapp" />
			<input type="hidden" name="id" value={$newShareId} />

			{#if $textareaVisible}
				<div class="relative">
					<textarea
						name="content"
						class="bg-black border-none border-t border-t-gray-700 p-2 w-full min-h-32"
						on:keydown={handleCtrlEnter}
						bind:value={$textareaValue}
						bind:this={textareaElement}
						maxlength={MAX_CHARS}
					/>
					<div class="absolute bottom-3 left-2 text-xs text-gray-500">
						{MAX_CHARS - $textareaValue.length} chars left
					</div>
				</div>
				<button class="text-xs p-1 absolute bottom-2 right-2 align-middle">
					<Icon data={save} class="w-4 h-4" />
					<span class="ml-1 text-sm">Save</span>
				</button>
			{:else}
				<button
					on:click={() => ($textareaVisible = true)}
					class="w-full bg-black p-2 text-gray-500 border-none border-t border-t-gray-700 min-h-10"
				>
					Click to save stuff...
				</button>
			{/if}
		</form>
	</div>

	<div slot="default" class="col-span-12 gap-2 space-y-2 overflow-y-auto px-4 overflow-x-hidden">
		{#each $shares as share (share.id)}
			<div animate:flip={{ duration: 500, easing: expoOut }}>
				{#if $entities.get(share.id)}
					<div class="my-16">
						{#each $entities.get(share.id) || [] as entity (entity.id)}
							<div in:slide={{ duration: 500, easing: expoOut }}>
								<EntityComponent {entity} />
							</div>
						{/each}
					</div>
				{:else}
					<div
						class="opacity-30 hover:opacity-70 overflow-x-auto border border-gray-300 p-4 rounded-lg flex flex-row items-center relative"
					>
						<div class="flex-grow">{share.content}</div>
						<Spinner className="absolute top-4 right-4" />
					</div>
				{/if}
				<!-- <span class="text-xs text-gray-500">{share.id}</span> -->
			</div>
		{/each}
	</div>

	<div slot="footer"></div>
</ChatLayout>
