<script lang="ts">
	import FrontMatterPanel from '../src/lib/components/FrontMatterPanel.svelte';
	import { tabManager } from '../src/lib/stores/tabs.svelte.js';
	import { parseFrontMatter } from '../src/lib/utils/frontMatter.js';

	let activeTab = $derived(tabManager.activeTab);
	let rawContent = $derived(activeTab?.rawContent ?? '');
	let frontMatter = $derived(parseFrontMatter(rawContent));
	let panelKey = $derived(activeTab?.path || tabManager.activeTabId || 'untitled');
	let collapsedByKey = $state<Record<string, boolean>>({});
	let collapsed = $derived(collapsedByKey[panelKey] ?? false);

	function setCollapsed(value: boolean) {
		collapsedByKey = { ...collapsedByKey, [panelKey]: value };
	}
</script>

<div class="markdown-body">
	{#if frontMatter.exists}
		<FrontMatterPanel {frontMatter} {collapsed} oncollapsedchange={setCollapsed} />
	{/if}
	<div class="markdown-blocks"></div>
</div>
