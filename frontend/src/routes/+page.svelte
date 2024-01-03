<script lang="ts">
import { onMount } from 'svelte';
import { userStore, getUser, signUpUser } from '$lib/userStore';

const user = userStore;
let email = '';
let password = '';

const signUp = () => {
  signUpUser({ email, password });
}

onMount(getUser);
</script>

<div class="container h-full mx-auto flex justify-center items-center">
	<div class="space-y-5">
  {#if $user}
    <h1>Hi, {$user.email}!</h1>
  {:else}
    <h1>Hi, guest!</h1>
    <h2>Sign up:</h2>

    <form method="POST" on:submit|preventDefault={signUp}>
      <input type="text" name="email" bind:value={email} placeholder="Email" />
      <input type="password" name="password" bind:value={password} placeholder="Password" />
      <button type="submit">Sign up</button>
    </form>
  {/if}
	</div>
</div>
