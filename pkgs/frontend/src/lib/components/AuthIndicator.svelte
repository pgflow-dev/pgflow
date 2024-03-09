<script lang="ts">
	import type { User } from '@supabase/supabase-js';

	export let user: User | null;
	export let isSuperadmin: boolean;
</script>

{#if user}
	<span class="font-bold">
		{user.email}

		{#if isSuperadmin}
			<span title="Superadmin" class="badge">👑</span>
		{/if}
	</span>

	<a href="/auth/sign-out" class="btn btn-sm variant-ghost-error">Sign out</a>
{:else}
	<a href="/auth/sign-in" class="btn btn-sm variant-filled-primary">Sign in</a>
{/if}
