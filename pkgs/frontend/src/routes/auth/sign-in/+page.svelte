<script lang="ts">
	import { PUBLIC_URL } from '$env/static/public';
	import { Icon } from 'svelte-awesome';
	import { google, github, envelope } from 'svelte-awesome/icons';
	import { randomTagline } from '$lib/texts';
	import { page } from '$app/stores';

	export let data;
	let { supabase } = data;
	$: ({ supabase } = data);

	let tagline = randomTagline();

	const nextPath = $page.params['next'] || '/share';
	const redirectTo = `${PUBLIC_URL}/auth/callback?next=${nextPath}`;

	function signInWithGithub() {
		supabase.auth.signInWithOAuth({
			provider: 'github',
			options: { redirectTo }
		});
	}

	function signInWithGoogle() {
		supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo }
		});
	}

	let email = '';
	let loading = false;
	let linkSent = false;

	async function signInWithEmail() {
		loading = true;

		const { data: _data, error } = await supabase.auth.signInWithOtp({
			email: email,
			options: {
				shouldCreateUser: true,
				emailRedirectTo: redirectTo
			}
		});

		if (error) {
			throw error;
		}

		linkSent = true;
		return _data;
	}

	function isValidEmail(email: string) {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
	}
</script>

<main class="container mx-auto px-4 py-8 max-w-md">
	<h1 class="text-3xl font-bold mb-2 text-center mt-4">
		{tagline}
	</h1>

	{#if linkSent}
		<div class="flex flex-col space-y-4 mt-24 mb-6 p-8 m-6 card">
			<h2 class="h2">Magic link sent!</h2>
			<p>Check your email client and click the link to sign in</p>
		</div>
	{:else}
		<p class="text-gray-300 mt-4 mb-6">Log in to your Feedwise account</p>

		<div class="flex flex-col space-y-4 mb-6">
			<button
				class="flex items-center justify-center bg-[#4285F4] text-white py-3 px-6 rounded-lg shadow-md cvcover:bg-[#357AE8] transition duration-300 border border-[#4285F4] text-xl"
				on:click={signInWithGoogle}
			>
				<Icon data={google} class="mr-2 w-8 h-8" />
				Sign in with Google
			</button>

			<button
				class="flex items-center justify-center bg-[#24292e] text-white py-3 px-6 rounded-lg shadow-md hover:bg-[#2f363d] transition duration-300 border border-[#24292e] text-xl"
				on:click={signInWithGithub}
			>
				<Icon data={github} class="mr-2 w-8 h-8" />
				Sign in with GitHub
			</button>
		</div>

		<div class="flex items-center mb-6">
			<hr class="flex-grow border-t border-gray-700" />
			<span class="px-3 text-gray-400">or continue with email</span>
			<hr class="flex-grow border-t border-gray-700" />
		</div>

		<form class="flex flex-col space-y-2">
			<input
				type="email"
				required={true}
				bind:value={email}
				placeholder="Enter your email"
				class="input py-3 px-5 text-lg border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
			/>

			<button
				type="submit"
				on:click={signInWithEmail}
				disabled={!isValidEmail(email) || loading}
				class="flex items-center justify-center py-3 px-3 rounded-lg text-lg variant-ringed-surface transition-opacity duration-300 ease-in-out"
				class:opacity-30={!isValidEmail(email)}
				class:cursor-not-allowed={!isValidEmail(email) || loading}
			>
				{#if loading}
					<span class="w-8 h-8 mb-1 mr-2">⌛</span>
					signing in...
				{:else}
					<Icon data={envelope} class="mb-1 mr-2 w-8 h-8" />
					Continue with email
				{/if}
			</button>
		</form>
	{/if}
</main>
