<script lang="ts">
	import ChatLayout from '$components/feed/ChatLayout.svelte';

	import { Button } from '$components/ui/button';
	import { Textarea } from '$components/ui/textarea';
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
			scrollTarget.scrollIntoView({ behavior: 'auto' });
		}
	}

	$: $shares && scrollToBottom();

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

	let scrollTarget: HTMLDivElement | undefined;

	async function handleSubmit() {
		scrollToBottom();
	}
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

	<div slot="footer" class="col-span-12 absolute bottom-0 left-0 w-full">
		<form
			method="POST"
			use:enhance
			action="/feed/add-share"
			class="relative"
			on:submit={handleSubmit}
		>
			<Textarea
				name="content"
				class="border-none border-t border-t-gray-700 min-h-10 focus:h-72 transition-height duration-300 ease-in-out"
				placeholder="Dump your stuff here bro..."
				on:keydown={handleKeydown}
				bind:value={$textareaValue}
			/>

			<input type="hidden" name="__source" value="webapp" />

			<Button variant="ghost" class="text-xs p-1 absolute bottom-1 right-1 align-middle">
				<Icon data={save} class="w-4 h-4" />
				<span class="ml-1 text-sm">Save</span>
			</Button>
		</form>
	</div>
</ChatLayout>
