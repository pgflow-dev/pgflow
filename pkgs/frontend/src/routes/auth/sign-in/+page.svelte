<script lang="ts">
	import { PUBLIC_URL } from '$env/static/public';

	export let data;
	let { supabase } = data;
	$: ({ supabase } = data);

	let email = '';
	let inProgress = false;
	let linkSent = false;

	function isValidEmail(email: string) {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
	}

	async function signInWithEmail() {
		inProgress = true;

		const { data: _data, error } = await supabase.auth.signInWithOtp({
			email: email,
			options: {
				shouldCreateUser: true,
				emailRedirectTo: PUBLIC_URL
			}
		});

		if (error) {
			throw error;
		}

		linkSent = true;
		return _data;
	}
</script>

<div class="flex flex-col items-center justify-center h-screen space-y-4">
	{#if linkSent}
		<h3 class="h3">Magic link sent!</h3>
		<p>Check your email client and click the link to sign in</p>
	{:else}
		<h3 class="h3">Sign in with magic link</h3>
		<p>Enter your email and we'll send you a magic link to sign in.</p>
		<label class="label flex flex-col items-center">
			<input
				class="input"
				type="text"
				placeholder="email"
				disabled={inProgress}
				bind:value={email}
			/>
		</label>

		<button
			on:click={signInWithEmail}
			disabled={!isValidEmail(email) || inProgress}
			value={email}
			class="btn variant-filled"
		>
			Send magic link
		</button>
	{/if}
</div>
