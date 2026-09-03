import assert from 'node:assert/strict';
import test from 'node:test';

import { readSource, readSourceBytes } from './sourceTree.js';

const merge = readSource('.opencode/skills/merge-upstream/SKILL.md');
const deploy = readSource('.opencode/skills/local-build-deploy/SKILL.md');

function frontmatter(source: string): string {
	const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
	assert.ok(match, 'skill has no frontmatter');
	return match[1];
}

function powershell(source: string): string {
	return [...source.matchAll(/```powershell\n([\s\S]*?)```/g)].map((match) => match[1]).join('\n');
}

test('project skills have discoverable standard frontmatter', () => {
	const mergeFrontmatter = frontmatter(merge);
	const deployFrontmatter = frontmatter(deploy);

	assert.match(mergeFrontmatter, /^name: merge-upstream$/m);
	assert.match(deployFrontmatter, /^name: local-build-deploy$/m);
	assert.match(mergeFrontmatter, /^description: .*合并上游.*merge upstream.*sync fork/m);
	assert.match(deployFrontmatter, /^description: .*本地构建.*构建并部署.*部署 Markpad/m);
	assert.doesNotMatch(mergeFrontmatter, /^slash:/m);
	assert.doesNotMatch(deployFrontmatter, /^slash:/m);
});

test('upstream review, merge, validation and push are pinned to immutable commits', () => {
	assert.match(merge, /upstream.*https:\/\/github\.com\/sftwrdotdev\/Markpad\.git/);
	assert.match(merge, /origin.*https:\/\/github\.com\/lshdq\/Markpad\.git/);
	assert.ok(merge.includes('$reviewedUpstreamSha = (git rev-parse upstream/master).Trim()'));
	assert.ok(merge.includes('$reviewedMasterSha = (git rev-parse master).Trim()'));
	assert.ok(merge.includes('$reviewedUpstreamSha = "<REVIEWED_UPSTREAM_SHA>"'));
	assert.ok(merge.includes('$reviewedMasterSha = "<REVIEWED_MASTER_SHA>"'));
	assert.ok(merge.includes('git diff --stat "${reviewedMasterSha}...$reviewedUpstreamSha"'));
	assert.ok(merge.includes('$currentUpstreamSha -ne $reviewedUpstreamSha'));
	assert.ok(merge.includes('$currentMasterSha -ne $reviewedMasterSha'));
	assert.ok(merge.includes('$currentHeadSha -ne $reviewedMasterSha'));
	assert.ok(merge.includes('$currentBranch -ne "master"'));
	assert.ok(merge.includes('$currentStatus.Count -ne 0'));
	assert.ok(merge.includes('git -c core.editor=true merge $reviewedUpstreamSha'));
	assert.match(merge, /conflictedFiles\.Count -eq 0/);
	assert.ok(merge.includes('git -c core.editor=true merge --continue'));
	assert.ok(merge.includes('$mergeResultSha = (git rev-parse HEAD).Trim()'));
	assert.ok(merge.includes('$validatedMergeSha = "<VALIDATED_MERGE_SHA>"'));
	assert.ok(merge.includes('$headSha -ne $validatedMergeSha'));
	assert.ok(merge.includes('$masterSha -ne $validatedMergeSha'));
	assert.ok(merge.includes('git push origin "${validatedMergeSha}:refs/heads/master"'));
});

test('every upstream assessment command is followed by an exit-code check', () => {
	for (const command of [
		'git rev-list --left-right --count "${reviewedMasterSha}...$reviewedUpstreamSha"',
		'git log --oneline --decorate "${reviewedMasterSha}..$reviewedUpstreamSha"',
		'git log --oneline --decorate "${reviewedUpstreamSha}..$reviewedMasterSha"',
		'git diff --stat "${reviewedMasterSha}...$reviewedUpstreamSha"',
		'git diff --name-status "${reviewedMasterSha}...$reviewedUpstreamSha"',
	]) {
		const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		assert.match(merge, new RegExp(`${escaped}\\n\\s*if \\(\\$LASTEXITCODE -ne 0\\)`), command);
	}
});

test('every quality-gate native command is followed by an exit-code check', () => {
	for (const source of [merge, deploy]) {
		for (const command of [
			'npm ci',
			'npm audit',
			'npm run check',
			'node --test --import tsx scripts/*.test.ts',
			'npm run test:vitest',
			'cargo fmt --check',
			'cargo test',
			'cargo clippy --all-targets -- -D warnings',
		]) {
			const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			assert.match(source, new RegExp(`${escaped}\\n\\s*if \\(\\$LASTEXITCODE -ne 0\\)`), command);
		}
	}
});

test('local build proves a fresh x64 artifact from the effective Cargo target directory', () => {
	assert.ok(deploy.includes('$targetTriple = "x86_64-pc-windows-msvc"'));
	assert.match(deploy, /cargoMetadata\.target_directory/);
	assert.ok(deploy.includes('Remove-Item -LiteralPath $source -Force -ErrorAction Stop'));
	assert.ok(deploy.includes('npm run tauri build -- --no-sign --target $targetTriple'));
	assert.match(deploy, /LastWriteTimeUtc/);
	assert.ok(deploy.includes('$machine -ne 0x8664'));
	assert.match(deploy, /Version mismatch: exe=/);
	assert.ok(deploy.includes('$source = "<VALIDATED_SOURCE_PATH>"'));
	assert.ok(deploy.includes('$sourceHash -ne $validatedSourceHash'));
});

test('local deployment is serialized, atomic and rollback-checked', () => {
	assert.ok(deploy.includes('$ErrorActionPreference = "Stop"'));
	assert.match(deploy, /Global\\MarkpadLocalBuildDeploy/);
	assert.match(deploy, /WaitOne\(0\)/);
	assert.ok(deploy.includes('[System.IO.File]::Replace($temporary, $target, $backup, $true)'));
	assert.match(deploy, /Guid\]::NewGuid\(\)/);
	assert.match(deploy, /temporaryHash.*-ne \$sourceHash/);
	assert.match(deploy, /targetHash.*-ne \$sourceHash/);
	assert.ok(deploy.includes('$restoredHash -ne $backupHash'));
	assert.ok(deploy.includes('Start-Process -FilePath $target -PassThru -ErrorAction Stop'));
	assert.match(deploy, /rollback also failed/);

	const commands = powershell(deploy);
	assert.doesNotMatch(commands, /\bStop-Process\b/i);
	assert.doesNotMatch(commands, /\btaskkill\b/i);
	assert.doesNotMatch(commands, /Get-Process[^\n]*SilentlyContinue/i);
	assert.doesNotMatch(commands, /bundle\\nsis.*Start-Process/i);
});

test('skills preserve confirmation, updater and release boundaries', () => {
	assert.match(merge, /等待用户明确确认。未获确认不得执行合并/);
	assert.match(merge, /plugins\.updater\.pubkey/);
	assert.match(deploy, /plugins\.updater\.pubkey/);
	assert.match(merge, /不运行 `npm run release`/);
	assert.match(deploy, /不运行 `npm run release`/);
	assert.match(merge, /退出并重新启动 OpenCode/);
	assert.match(deploy, /退出并重新启动 OpenCode/);
});

test('all delivered text files use LF and have no trailing whitespace', () => {
	for (const path of [
		'.opencode/skills/merge-upstream/SKILL.md',
		'.opencode/skills/local-build-deploy/SKILL.md',
		'docs/需求-Markpad上游合并与本地构建部署Skill.md',
		'docs/测试用例-Markpad上游合并与本地构建部署Skill.md',
		'scripts/opencodeSkills.test.ts',
		'scripts/sourceTree.ts',
	]) {
		const bytes = readSourceBytes(path);
		const text = bytes.toString('utf8');
		assert.equal(bytes.includes(0x0d), false, `${path} contains CR bytes`);
		assert.doesNotMatch(text, /[ \t]+$/m, `${path} has trailing whitespace`);
		assert.ok(text.endsWith('\n'), `${path} has no final newline`);
	}
});
