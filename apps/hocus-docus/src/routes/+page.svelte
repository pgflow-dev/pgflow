<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';
	import CardContent from '$lib/components/ui/card/card-content.svelte';
	import CardHeader from '$lib/components/ui/card/card-header.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import Label from '$lib/components/ui/label/label.svelte';

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
	<Card class="mx-auto max-w-md">
		<CardHeader class="text-3xl font-thin">Manage your profile</CardHeader>
		<CardContent>
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
				<div>
					<Label>Email</Label>
					<Input bind:value={email} />
				</div>
				<div>
					<Label>First Name</Label>
					<Input bind:value={firstName} />
				</div>
				<div>
					<Label>Last Name</Label>
					<Input bind:value={lastName} />
				</div>
				<div class="mt-5">
					<Button type="submit">Update Profile</Button>
				</div>
			</form>
		</CardContent>
	</Card>
{:else}
	<div class="flex justify-center">
		<Button href="/auth/login">Login to the site!</Button>
	</div>
{/if}
