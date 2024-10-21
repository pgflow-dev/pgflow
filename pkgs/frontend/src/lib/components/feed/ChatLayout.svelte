<script lang="ts">
	import LayoutWithHeaderAndSidebar from '$components/LayoutWithHeaderAndSidebar.svelte';
</script>

<LayoutWithHeaderAndSidebar>
	<slot name="header:bottom" />

	<main class="flex-grow overflow-y-scroll">
		<slot />
	</main>

	<footer class="bottom-0 dark:bg-black p-0 m-0 b-0 sticky">
		<slot name="footer" />
	</footer>
</LayoutWithHeaderAndSidebar>
