<script lang="ts">
	import {
		getFrontMatterListItems,
		type FrontMatterParseResult,
	} from '../utils/frontMatter.js';

	let { frontMatter, collapsed, oncollapsedchange } = $props<{
		frontMatter: FrontMatterParseResult;
		collapsed: boolean;
		oncollapsedchange: (collapsed: boolean) => void;
	}>();
</script>

{#if frontMatter.exists}
	<details
		class="frontmatter-panel"
		open={!collapsed}
		ontoggle={(event) => oncollapsedchange(!(event.currentTarget as HTMLDetailsElement).open)}>
		<summary class="frontmatter-summary">
			<span class="frontmatter-chevron" aria-hidden="true">›</span>
			<span class="frontmatter-title">Properties</span>
			<span class="frontmatter-count">{frontMatter.valid ? frontMatter.fields.length : 0}</span>
		</summary>

		{#if frontMatter.valid}
			<dl class="frontmatter-grid">
				{#each frontMatter.fields as field (field.key)}
					<dt class="frontmatter-key">{field.key}</dt>
					<dd class="frontmatter-value">
						{#if field.kind === 'list'}
							<div class="frontmatter-tags" role="list" aria-label={`${field.key} tags`}>
								{#each getFrontMatterListItems(field) as tag, index (`${tag}-${index}`)}
									<span class="frontmatter-tag" role="listitem">{tag}</span>
								{/each}
							</div>
						{:else}
							<span class="frontmatter-static-value">{field.displayValue}</span>
						{/if}
					</dd>
				{/each}
			</dl>
		{:else}
			<div class="frontmatter-error" role="status">{frontMatter.error}</div>
		{/if}
	</details>
{/if}
