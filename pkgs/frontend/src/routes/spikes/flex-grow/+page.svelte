<script lang="ts">
	import ChatLayout from '$components/ChatLayout.svelte';

	let lorem = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed euismod, nisl nec ultricies lacinia, nunc nisl aliquam nisi, vitae aliquam libero urna eget neque. Nullam auctor, nisl sit amet consectetur sagittis, nunc dui mollis lectus, non tempus massa nibh at velit.

Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Suspendisse potenti. Nullam euismod urna sed dolor consectetur, nec aliquet nunc vestibulum. Sed id risus quis velit tempor venenatis.

Donec augue lorem, ultrices at tincidunt sit amet, suscipit eget massa. Nulla facilisi. Suspendisse potenti. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Donec vel lectus nec purus tempor venenatis.

Nullam eget nisl ac eros consequat tincidunt. Sed id risus quis velit tempor venenatis. Nulla facilisi. Suspendisse potenti. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Donec vel lectus nec purus tempor venenatis.

Sed euismod, nisl nec ultricies lacinia, nunc nisl aliquam nisi, vitae aliquam libero urna eget neque. Nullam auctor, nisl sit amet consectetur sagittis, nunc dui mollis lectus, non tempus massa nibh at velit.

Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Suspendisse potenti. Nullam euismod urna sed dolor consectetur, nec aliquet nunc vestibulum. Sed id risus quis velit tempor venenatis.

Donec augue lorem, ultrices at tincidunt sit amet, suscipit eget massa. Nulla facilisi. Suspendisse potenti. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Donec vel lectus nec purus tempor venenatis.

Nullam eget nisl ac eros consequat tincidunt. Sed id risus quis velit tempor venenatis. Nulla facilisi. Suspendisse potenti. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Donec vel lectus nec purus tempor venenatis.
	`;

	let bigLorem = lorem.repeat(10);
</script>

<ChatLayout>
	<svelte:fragment slot="messages">
		{bigLorem}
	</svelte:fragment>

	<svelte:fragment slot="prompt">
		<input type="search" placeholder="Search..." /> <button class="btn">search</button>
	</svelte:fragment>
</ChatLayout>
