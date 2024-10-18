<script lang="ts">
	import { Button } from '$components/ui/button';
	import * as Sheet from '$components/ui/sheet';
	import PanelLeft from 'lucide-svelte/icons/panel-left';
	import Download from 'lucide-svelte/icons/download';
	import Search from 'lucide-svelte/icons/search';
	import LogOut from 'lucide-svelte/icons/log-out';
	import LogIn from 'lucide-svelte/icons/log-in';
</script>

<div class="flex flex-col min-h-screen">
	<header class="sticky top-0 z-50 shadow-md flex items-center pr-3 dark:bg-black h-10">
		<slot name="header">
			<Sheet.Root>
				<Sheet.Trigger asChild let:builder>
					<Button variant="ghost" size="icon" builders={[builder]} class="sm:hidden">
						<PanelLeft size="22" />
					</Button>
				</Sheet.Trigger>
				<Sheet.Content side="left" class="sm:max-w-xs border-r-gray-800">
					<h2 class="text-lg font-medium mb-8">feedwise</h2>
					<nav class="grid gap-6 text-lg font-medium text-right w-full">
						<a
							href="/feed/add-share"
							class="text-muted-foreground hover:text-foreground flex items-center gap-4 px-2.5"
						>
							<Download class="h-5 w-5" />
							Save stuff
						</a>
						<a
							href="/feed/shares"
							class="text-muted-foreground hover:text-foreground flex items-center gap-4 px-2.5"
						>
							<Search class="h-5 w-5" />
							Find stuff
						</a>
						<a
							href="/auth/sign-in"
							class="text-muted-foreground hover:text-foreground flex items-center gap-4 px-2.5"
						>
							<LogIn class="h-5 w-5" />
							Log in
						</a>
						<a
							href="/auth/sign-out"
							class="text-muted-foreground hover:text-foreground flex items-center gap-4 px-2.5"
						>
							<LogOut class="h-5 w-5" />
							Log out
						</a>
					</nav>
				</Sheet.Content>
			</Sheet.Root>

			<div class="flex-grow" />

			<h1 class="h1 font-bold">feedwise</h1>
		</slot>
	</header>

	<slot />
</div>
