<script>
	import '../app.css';
	import { goto, invalidate } from '$app/navigation';
	import { ModeWatcher } from 'mode-watcher';
	import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
	import { Button } from '$lib/components/ui/button';

	const { data: propsData, children } = $props();

	const { supabase, session } = propsData;

	$effect(() => {
		const { data } = supabase.auth.onAuthStateChange((_, newSession) => {
			if (!newSession) {
				/**
				 * Queue this as a task so the navigation won't prevent the
				 * triggering function from completing
				 */
				setTimeout(() => {
					goto('/', { invalidateAll: true });
				});
			}
			if (newSession?.expires_at !== session?.expires_at) {
				invalidate('supabase:auth');
			}
		});

		return () => data.subscription.unsubscribe();
	});
</script>

<ModeWatcher />

<div class="flex min-h-screen flex-col">
	<nav class="border-b p-2">
		<div class="mx-auto flex w-full max-w-2xl items-center justify-between">
			<a href="/" class="text-2xl font-bold">App</a>

			<div class="flex gap-2">
				<ThemeToggle />
				{#if session !== null}
					<Button href="/auth/logout">logout</Button>
				{/if}
			</div>
		</div>
	</nav>

	<main class="mx-auto w-full max-w-2xl flex-grow px-2 py-5 md:px-0">
		{@render children()}
	</main>

	<footer class="w-full border-t py-5">
		<div class="mx-auto flex w-full max-w-2xl items-center justify-center">
			<a href="https://github.com/engageintellect" class="text-sm">@engageintellect</a>
		</div>
	</footer>
</div>

<style>
	html,
	body {
		height: 100%;
		margin: 0;
		padding: 0;
	}
</style>
