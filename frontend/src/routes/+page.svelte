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
      <input type="text" name="email" bind:value={email} placeholder="Email" />
      <input type="password" name="password" bind:value={password} placeholder="Password" />
      <button type="submit">Sign up</button>
    </form>
  {/if}
	</div>
</div>
