<script lang="ts">
	import { PUBLIC_URL } from '$env/static/public';
	import { Icon } from 'svelte-awesome';
	import { google, github } from 'svelte-awesome/icons';

	export let data;
	let { supabase } = data;
	$: ({ supabase } = data);

	const taglines = [
		'Save Now, Stress Never.',
		'Busy Bees, Content Freeze.',
		'Snap, Save, Savor Later.',
		"Content on Ice, Life's Nice.",
		'Save Today, Chill Tomorrow.',
		'Busy Life, Saved Bytes.',
		'Quick Save, No Rave.',
		'Content Stash, No Hassle.',
		'Save Fast, Relax Last.',
		'Busy Brain? Save the Strain.',
		'Snap, Save, Simplify.',
		'Save Now, Thank Yourself Later.',
		'Busy? Save and Brave.',
		'Content Catch, No Match.',
		'Save in a Snap, Nap Later.',
		"Quick Save, Life's a Wave.",
		'Busy Life, Saved Right.',
		'Save Smart, Play Hard.',
		'Snap, Save, Smile.',
		'Save Quick, Live Slick.'
	];
	const randomTagline = taglines[Math.floor(Math.random() * taglines.length)];

	function signInWithGithub() {
		supabase.auth.signInWithOAuth({
			provider: 'github',
			options: { redirectTo: `${PUBLIC_URL}/auth/callback` }
		});
	}

	function signInWithGoogle() {
		supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: `${PUBLIC_URL}/auth/callback` }
		});
	}
</script>

<main class="container mx-auto px-4 py-8 max-w-md">
	<h1 class="text-3xl font-bold mb-2">{randomTagline}</h1>

	<p class="text-gray-600 mb-6">Log in to your FeedWise account</p>

	<div class="flex flex-col space-y-4 mb-6">
		<button
			class="flex items-center justify-center bg-[#4285F4] text-white py-3 px-6 rounded-lg shadow-md hover:bg-[#357AE8] transition duration-300 border border-[#4285F4] text-xl"
			on:click={signInWithGoogle}
		>
			<Icon data={google} class="mr-2 w-8 h-8" />
			Sign in with Google
		</button>

		<button
			class="flex items-center justify-center bg-[#24292e] text-white py-3 px-6 rounded-lg shadow-md hover:bg-[#2f363d] transition duration-300 border border-[#24292e] text-xl"
			on:click={signInWithGithub}
		>
			<Icon data={github} class="mr-2 w-8 h-8" />
			Sign in with GitHub
		</button>
	</div>

	<div class="flex items-center mb-6">
		<hr class="flex-grow border-t border-gray-300" />
		<span class="px-3 text-gray-500 text-sm">or</span>
		<hr class="flex-grow border-t border-gray-300" />
	</div>

	<form class="flex flex-col space-y-4">
		<input
			type="email"
			placeholder="Enter your email"
			class="py-2 px-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
		/>
		<button
			type="submit"
			class="bg-blue-500 text-white py-3 px-6 rounded-lg shadow-md hover:bg-blue-600 transition duration-300"
		>
			Continue
		</button>
	</form>
</main>

<style>
	:global(body) {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif,
			'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';
		background-color: #ffffff;
	}
</style>
