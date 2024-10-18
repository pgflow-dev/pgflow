<script lang="ts">
	import LayoutWithHeaderAndSidebar from '$components/LayoutWithHeaderAndSidebar.svelte';
</script>

<LayoutWithHeaderAndSidebar>
	<main class="flex-grow">
		<slot />
	</main>

	<footer class="sticky bottom-0 dark:bg-black">
		<slot name="footer" />
	</footer>
</LayoutWithHeaderAndSidebar>
