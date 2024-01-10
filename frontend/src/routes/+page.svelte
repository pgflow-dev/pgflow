<script lang="ts">
	import { onMount } from 'svelte';
	import { user, getUser, signUpUser, signOutUser } from '$lib/userStore';

	let email = '';
	let password = '';

	onMount(getUser);
</script>

<div class="container h-full mx-auto flex justify-center items-center">
	<div class="space-y-5">
		{#if $user}
			<h1>Hi, {$user.email}!</h1>
			<button on:click={signOutUser}>Log out</button>
		{:else}
			<h1>Hi, guest!</h1>
			<h2>Sign up:</h2>

			<form method="POST" on:submit|preventDefault={() => signUpUser(email, password)}>
				<label class="label">
					<span>email</span>
					<input class="input" type="text" name="email" bind:value={email} placeholder="Email" />
				</label>
				<label class="label">
					<span>password</span>
					<input
						class="input"
						type="password"
						name="password"
						bind:value={password}
						placeholder="Password"
					/>
				</label>

				<div>
					<button type="submit" class="mt-4 btn variant-filled">Sign Up</button>
				</div>
			</form>
		{/if}
	</div>
</div>
