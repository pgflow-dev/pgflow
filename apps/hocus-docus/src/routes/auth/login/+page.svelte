<script>
	import { Button } from '$lib/components/ui/button';

	import { Card } from '$lib/components/ui/card';
	import CardContent from '$lib/components/ui/card/card-content.svelte';
	import CardHeader from '$lib/components/ui/card/card-header.svelte';
	import Icon from '@iconify/svelte';
</script>

<Card class="mx-auto max-w-md">
	<CardHeader class="text-3xl font-thin">Login</CardHeader>
	<CardContent>
		<Button href="/auth/login/github" class="flex w-fit items-center gap-2">
			<Icon icon="mdi:github" class="h-6 w-6" />
			Login with GitHub
		</Button>
	</CardContent>
</Card>
