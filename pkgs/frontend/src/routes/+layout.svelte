<script lang="ts">
	import '../app.postcss';

	export let data;
	let { supabase } = data;
	$: ({ supabase } = data);

	// Highlight JS
	//import hljs from 'highlight.js/lib/core';
	//import 'highlight.js/styles/github-dark.css';
	//import { storeHighlightJs } from '@skeletonlabs/skeleton';
	//import xml from 'highlight.js/lib/languages/xml'; // for HTML
	//import css from 'highlight.js/lib/languages/css';
	//import javascript from 'highlight.js/lib/languages/javascript';
	//import typescript from 'highlight.js/lib/languages/typescript';

	//hljs.registerLanguage('xml', xml); // for HTML
	//hljs.registerLanguage('css', css);
	//hljs.registerLanguage('javascript', javascript);
	//hljs.registerLanguage('typescript', typescript);
	//storeHighlightJs.set(hljs);

	// Floating UI for Popups
	import { computePosition, autoUpdate, flip, shift, offset, arrow } from '@floating-ui/dom';
	import { storePopup } from '@skeletonlabs/skeleton';
	storePopup.set({ computePosition, autoUpdate, flip, shift, offset, arrow });

	let userPromise = supabase.auth.getUser();
</script>

{#await userPromise}
	<h3>Fetching user data...</h3>
{:then user}
	<h3>Logged in as: {JSON.stringify(user)}</h3>
{:catch error}
	<h3>Error: {error.message}</h3>
{/await}
<slot />
