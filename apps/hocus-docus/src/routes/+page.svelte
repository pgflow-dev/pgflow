<script lang="ts">
	import Hero from '$lib/components/Hero.svelte';
	import UpdateProfile from '$lib/components/UpdateProfile.svelte';

	export let data;
	let avatar: string;

	// Reactive statement to update avatar when data changes
	$: userProfile = data?.userProfile || '';
	$: avatar = data?.user?.user_metadata?.avatar_url || '';
</script>

{#if data?.userProfile}
	<UpdateProfile {userProfile} {avatar} />
{:else}
	<Hero />
{/if}
