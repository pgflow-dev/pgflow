<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card/index';
	import Input from '$lib/components/ui/input/input.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import Hero from '$lib/components/Hero.svelte';

	const { data } = $props();
	const { userProfile } = data;

	let firstName = $state('');
	let lastName = $state('');
	let email = $state('');

	$effect(() => {
		if (userProfile) {
			firstName = userProfile.firstName;
			lastName = userProfile.lastName;
			email = userProfile.email;
		}
	});
</script>

{#if userProfile}
	<Card.Root class="mx-auto max-w-md">
		<Card.Header>
			<Card.Title class="text-3xl font-thin">Profile</Card.Title>
			<Card.Description>Update your profile information</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="post"
				use:enhance={({ formData }) => {
					formData.set('firstName', firstName);
					formData.set('lastName', lastName);
					formData.set('email', email);
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
						<Input bind:value={firstName} />
					</div>
					<div class="w-full">
						<Label>Last Name</Label>
						<Input bind:value={lastName} />
					</div>
				</div>

				<div class="mt-4">
					<Label>Email</Label>
					<Input bind:value={email} />
				</div>

				<div class="mt-5">
					<Button type="submit" class="w-full">Update Profile</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
{:else}
	<Hero />
{/if}
