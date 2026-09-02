import { expect, test } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import FrontMatterPanel from '../src/lib/components/FrontMatterPanel.svelte';
import { parseFrontMatter } from '../src/lib/utils/frontMatter.js';
import { readSource } from './sourceTree.js';
import { runeProps } from './runeProps.svelte.js';

const FRONT_MATTER = parseFrontMatter(`---
title: A long document title
count: 42
draft: false
empty: null
owner:
  name: Markpad
tags: [markdown, desktop]
---

# Body
`);

function harness() {
	const target = document.createElement('div');
	target.className = 'markdown-body';
	document.body.replaceChildren(target);
	const props = runeProps({
		frontMatter: FRONT_MATTER,
		collapsed: false,
		oncollapsedchange: (_collapsed: boolean) => {},
	});
	props.oncollapsedchange = (collapsed: boolean) => {
		props.collapsed = collapsed;
	};
	const component = mount(FrontMatterPanel, { target, props });
	flushSync();

	return {
		target,
		props,
		details: () => target.querySelector('details') as HTMLDetailsElement,
		stop: () => unmount(component),
	};
}

test('properties are expanded by default and report manual collapse changes', () => {
	const panel = harness();
	expect(panel.details().open).toBe(true);

	panel.details().open = false;
	panel.details().dispatchEvent(new Event('toggle'));
	flushSync();
	expect(panel.props.collapsed).toBe(true);
	expect(panel.details().open).toBe(false);
	panel.stop();
});

test('the long-lived viewer owns collapse state outside the Home branch', () => {
	const viewer = readSource('src/lib/MarkdownViewer.svelte');
	const panel = readSource('src/lib/components/FrontMatterPanel.svelte');

	expect(viewer).toMatch(/let frontMatterCollapsedByKey = \$state<Record<string, boolean>>\(\{\}\);/);
	expect(viewer).toMatch(/frontMatterCollapsedByKey\[frontMatterPanelKey\] \?\? false/);
	expect(viewer).toMatch(/oncollapsedchange=\{setFrontMatterCollapsed\}/);
	expect(panel).not.toMatch(/collapsedByKey|panelKey/);
});

test('every property kind renders as static content', () => {
	const panel = harness();
	const values = Array.from(panel.target.querySelectorAll('.frontmatter-static-value')).map(
		(element) => element.textContent,
	);
	const tags = Array.from(panel.target.querySelectorAll('.frontmatter-tag')).map(
		(element) => element.textContent,
	);

	expect(values).toEqual([
		'A long document title',
		'42',
		'false',
		'',
		'{"name":"Markpad"}',
	]);
	expect(tags).toEqual(['markdown', 'desktop']);
	expect(panel.target.querySelectorAll('dl.frontmatter-grid')).toHaveLength(1);
	expect(panel.target.querySelectorAll('dt.frontmatter-key')).toHaveLength(6);
	expect(panel.target.querySelectorAll('dd.frontmatter-value')).toHaveLength(6);
	expect(panel.target.querySelectorAll('input, select, textarea, button')).toHaveLength(0);
	panel.stop();
});

test('invalid front matter stays expanded and displays its parse error', () => {
	const panel = harness();
	panel.props.frontMatter = parseFrontMatter(`---
title: [broken
---

# Body
`);
	flushSync();

	expect(panel.details().open).toBe(true);
	expect(panel.target.querySelector('[role="status"]')?.textContent).not.toBe('');
	expect(panel.target.querySelector('.frontmatter-grid')).toBeNull();
	panel.stop();
});

test('a missing front matter block does not render a properties panel', () => {
	const panel = harness();
	panel.props.frontMatter = parseFrontMatter('# Body');
	flushSync();

	expect(panel.target.querySelector('.frontmatter-panel')).toBeNull();
	panel.stop();
});

test('static values and tags preserve content while allowing long words to wrap', () => {
	const styles = readSource('src/styles.css');

	expect(styles).toMatch(/\.frontmatter-key \{[\s\S]*?margin:\s*0;[\s\S]*?font-style:\s*normal;/);
	expect(styles).toMatch(/\.frontmatter-value \{[\s\S]*?margin:\s*0;[\s\S]*?padding:\s*0;/);
	expect(styles).toMatch(/\.frontmatter-static-value \{[\s\S]*?white-space:\s*pre-wrap;[\s\S]*?overflow-wrap:\s*anywhere;/);
	expect(styles).toMatch(/\.frontmatter-tag \{[\s\S]*?white-space:\s*normal;[\s\S]*?overflow-wrap:\s*anywhere;/);
});
