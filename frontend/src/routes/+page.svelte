<script lang="ts">
import { user } from '$lib/stores';
</script>

<div class="container h-full mx-auto flex justify-center items-center">
	<div class="space-y-5">
    <label class="label">
      <span>signed in?</span>
      <input class="input" type="checkbox" bind:checked={$user} />
    </label>

    {#if $user}
      <button class="p-6 border-black">sign out</button>
    {:else}
      <button class="p-6 border-black">sign in</button>
      <button class="p-6 border-black">sign up</button>
    {/if}
	</div>
</div>
