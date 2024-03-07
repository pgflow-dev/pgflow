<script lang="ts">
	export let data;
	let { supabase } = data;
	$: ({ supabase } = data);

	let email = 'john.doe@example.com';
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
				emailRedirectTo: 'http://localhost:5173/'
			}
		});
		console.log('_data', _data);

		if (error) {
			throw error;
		}

		linkSent = true;
		return _data;
	}
</script>

<div class="flex flex-col items-center justify-center h-screen">
	{#if linkSent}
		<h3 class="h3">Magic link sent!</h3>
		<p>Check your email client and click the link to sign in</p>
	{:else}
		<h3 class="h3">Sign in with magic link</h3>
		<label class="label flex flex-col items-center">
			<input class="input" type="text" placeholder="email" bind:value={email} />
		</label>

		<button
			on:click={signInWithEmail}
			disabled={!isValidEmail(email) || inProgress}
			value={email}
			class="btn btn-xl variant-filled"
		>
			Send magic link
		</button>
	{/if}
</div>
