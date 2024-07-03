<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card/index';
	import Icon from '@iconify/svelte';
</script>

<div>
	<Card.Root class="mx-auto max-w-md">
		<Card.Header>
			<Card.Title class="text-5xl font-thin">
				<div class="flex items-center justify-center gap-2">
					<Icon icon="logos:svelte-icon" class="h-24 w-24" />
					<div>+</div>
					<Icon icon="logos:supabase-icon" class="h-24 w-24" />
				</div>
			</Card.Title>
			<!-- <Card.Description>Choose a provider to login with</Card.Description> -->
		</Card.Header>
		<Card.Content>
			<Button href="/auth/login" class="group/loginButton w-full">
				<div class="flex items-center gap-2">
					<div>Login</div>
					<Icon
						icon="mdi:login"
						class="h-5 w-5 transition-all duration-300 md:group-hover/loginButton:translate-x-1"
					/>
				</div>
			</Button>
		</Card.Content>
	</Card.Root>
</div>
