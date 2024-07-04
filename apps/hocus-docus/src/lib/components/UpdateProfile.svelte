<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card/index';
	import Input from '$lib/components/ui/input/input.svelte';
	import Label from '$lib/components/ui/label/label.svelte';

	export let userProfile;
	export let avatar;
</script>

<Card.Root class="mx-auto max-w-md">
	<Card.Header>
		<Card.Title class="text-3xl font-thin">Profile</Card.Title>
		<Card.Description>Update your profile information</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if avatar}
			<div class="flex justify-start">
				<img src={avatar} alt="user avatar" class="mb-5 h-24 w-24 rounded-lg object-cover shadow" />
			</div>
		{/if}
		<form
			method="post"
			use:enhance={({ formData }) => {
				formData.set('firstName', userProfile.firstName);
				formData.set('lastName', userProfile.lastName);
				formData.set('email', userProfile.email);
				formData.set('username', userProfile.username);
				return ({ result }) => {
					if (result.type === 'success') {
						invalidate('/');
						alert('UPDATED!');
					} else {
						alert('ERROR!');
					}
				};
			}}
		>
			<div class="flex items-center gap-2">
				<div class="w-full">
					<Label>First Name</Label>
					<Input bind:value={userProfile.firstName} />
				</div>
				<div class="w-full">
					<Label>Last Name</Label>
					<Input bind:value={userProfile.lastName} />
				</div>
			</div>

			<div class="mt-4">
				<Label>Email</Label>
				<Input bind:value={userProfile.email} />
			</div>

			<div class="mt-5">
				<Button type="submit" class="w-full">Update Profile</Button>
			</div>
		</form>
	</Card.Content>
</Card.Root>
