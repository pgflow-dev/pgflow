<script>
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card/index';
	import Icon from '@iconify/svelte';
</script>

<Card.Root class="mx-auto max-w-md">
	<Card.Header>
		<Card.Title class="text-3xl font-thin">Login</Card.Title>
		<Card.Description>Choose a provider to login with</Card.Description>
	</Card.Header>
	<Card.Content>
		<Button href="/auth/login/github" class="flex items-center gap-2">
			<Icon icon="mdi:github" class="h-6 w-6" />
			Login with GitHub
		</Button>
	</Card.Content>
</Card.Root>
