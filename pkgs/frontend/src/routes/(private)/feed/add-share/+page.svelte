<script lang="ts">
	import ChatLayout from '$components/feed/ChatLayout.svelte';

	import { Button } from '$components/ui/button';
	import type { InferredFeedShareRow, Entity } from '$lib/db/feed';
	import { derived, writable } from 'svelte/store';
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

	export let data;

	let { supabase } = data;
	$: ({ supabase } = data);

	const shares = writable<InferredFeedShareRow[]>([]);
	const reversedShares = derived(shares, ($shares) => [...$shares].reverse());
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

	async function scrollToBottom() {
		await tick();
		if (scrollTarget) {
			scrollTarget.scrollIntoView({ behavior: 'instant' });
		}
	}

	$: $reversedShares && scrollToBottom();

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
						scrollToBottom();
						// Call scrollToBottom multiple times with increasing delays
						for (let i = 1; i <= 5; i++) {
							setTimeout(scrollToBottom, i * 200);
						}
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

	let scrollTarget: HTMLDivElement | undefined;

	async function handleSubmit() {
		scrollToBottom();
		$textareaVisible = false;
		$textareaValue = '';
	}

	let textareaElement: HTMLTextAreaElement | undefined;
	const textareaVisible = writable(false);

	$: !!$textareaVisible && console.log('textareaElement', textareaElement);
</script>

<svelte:window on:keydown={handlePaste} />

<ChatLayout>
	<div slot="default" class="col-span-12 gap-2 space-y-2 overflow-y-auto px-4 overflow-x-hidden">
		{#each $reversedShares as share (share.id)}
			<div animate:flip={{ duration: 300, easing: expoOut }}>
				{#if $entities.get(share.id)}
					<div transition:slide={{ duration: 300 }} class="my-16">
						{#each $entities.get(share.id) || [] as entity (entity.id)}
							<div transition:slide={{ duration: 300 }}>
								<EntityComponent {entity} />
							</div>
						{/each}
					</div>
				{:else}
					<div
						transition:slide={{ duration: 300 }}
						class="opacity-30 hover:opacity-70 overflow-x-auto"
					>
						<pre><code>{share.content}</code></pre>
					</div>
				{/if}
			</div>
		{/each}
		<div bind:this={scrollTarget} />
	</div>

	<div slot="footer">
		<form
			method="POST"
			use:enhance
			action="/feed/add-share"
			class="relative"
			on:submit={handleSubmit}
		>
			<input type="hidden" name="__source" value="webapp" />

			{#if $textareaVisible}
				<textarea
					name="content"
					class="bg-black border-none border-t border-t-gray-700 p-2 w-full min-h-32 transition-height duration-300 ease-in-out"
					on:keydown={handleKeydown}
					bind:value={$textareaValue}
					bind:this={textareaElement}
				/>

				<Button variant="ghost" class="text-xs p-1 absolute bottom-0 right-2 align-middle">
					<Icon data={save} class="w-4 h-4" />
					<span class="ml-1 text-sm">Save</span>
				</Button>
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
</ChatLayout>
