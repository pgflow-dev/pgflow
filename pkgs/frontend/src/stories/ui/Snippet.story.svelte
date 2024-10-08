<script lang="ts">
	import type { Hst as HstType } from '@histoire/plugin-svelte';
	import Snippet from '$components/ui/Snippet.svelte';

	export let Hst: HstType;

	let language_code = 'ruby';
	let source = `# frozen_string_literal: true
class BlogPost < ActiveRecord::Base
	belongs_to :author, class_name: User.class_name
	has_many :comments

	validates :title, presence: true
	validates :body, presence: true

	after_initialize do
		self.published_at ||= Time.zone.now
	end
end`;
</script>

<Hst.Story title="ui.Snippet" layout={{ type: 'single', iframe: true }}>
	<Hst.Variant title="Default">
		<div class="columns-2 gap-2 space-y-2">
			<Snippet bind:source bind:language_code />
			<Snippet bind:source bind:language_code />
			<Snippet bind:source bind:language_code />
			<Snippet bind:source bind:language_code />
			<Snippet bind:source bind:language_code />
		</div>

		<svelte:fragment slot="controls">
			<Hst.Select
				title="Language Code"
				bind:value={language_code}
				options={['ruby', 'python', 'java']}
			/>

			<Hst.Textarea bind:value={source} title="Source" />
		</svelte:fragment>
	</Hst.Variant>
</Hst.Story>
