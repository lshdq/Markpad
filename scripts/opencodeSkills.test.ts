import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

import { readSource, readSourceBytes } from './sourceTree.js';

const merge = readSource('.opencode/skills/merge-upstream/SKILL.md');
const deploy = readSource('.opencode/skills/local-build-deploy/SKILL.md');
const requirements = readSource('docs/需求-Markpad上游合并与本地构建部署Skill.md');
const cases = readSource('docs/测试用例-Markpad上游合并与本地构建部署Skill.md');

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
});

test('V2 discovery guidance checks the Markpad location and never requires restarting to activate skills', () => {
	const forcedRestart = /(?:必须(?:提示用户)?|需要)\s*退出\s*并\s*重新\s*启动\s*OpenCode(?:\s*才能\s*生效)?|不会\s*热加载\s*修改后的项目级\s*skill/;
	assert.match('需要退出并重新启动 OpenCode 才能生效', forcedRestart);
	assert.match('必须提示用户退出并重新启动 OpenCode', forcedRestart);
	for (const source of [merge, deploy, requirements, cases]) {
		assert.doesNotMatch(source, forcedRestart);
	}
	for (const source of [merge, deploy]) {
		assert.match(source, /在 Markpad 项目上下文核对 skill 的 ID 和加载内容/);
		assert.match(source, /不把重启当作生效的前置条件/);
	}
	assert.match(cases, /首选动态验证（只读，不执行 skill 正文步骤）/);
	assert.match(cases, /分别用 `skill` 工具按这两个 ID 只读加载/);
	assert.match(cases, /`Base directory for this skill`/);
	assert.match(cases, /API 返回空清单不等于当前会话无法加载 skill/);
	assert.match(cases, /可选 API 诊断/);
	assert.match(cases, /opencode api --standalone get \/api\/location/);
	assert.match(cases, /opencode api --standalone get \/api\/skill/);
	assert.match(cases, /\$skills\.location\.directory -ne \$root/);
	assert.match(cases, /\$skills\.data \| Where-Object/);
	assert.match(cases, /\$_\.id -cne \$id/);
	assert.match(cases, /Resolve-Path -LiteralPath \$_\.path/);
	assert.match(cases, /\$actualPath\.Path -eq \$expectedPath/);
	assert.doesNotMatch(cases, /opencode debug skill/);
});

test('optional V2 API diagnostic rejects same-ID skills from other paths and empty lists', {
	skip: process.platform !== 'win32' && 'documented PowerShell snippet targets Windows',
}, () => {
	const script = /\*\*可选 API 诊断\*\*[\s\S]*?```powershell\n([\s\S]*?)```/.exec(cases)?.[1];
	assert.ok(script, 'optional API diagnostic has no PowerShell snippet');
	const mergePath = resolve('.opencode/skills/merge-upstream/SKILL.md');
	const deployPath = resolve('.opencode/skills/local-build-deploy/SKILL.md');
	const entry = (id: string, path: string) => ({ id, path });
	const run = (data: { id: string; path: string }[]) => {
		const mock = `function opencode {\n  $global:LASTEXITCODE = 0\n  if ($args[-1] -eq '/api/location') { '{"directory":${JSON.stringify(process.cwd())}}' }\n  elseif ($args[-1] -eq '/api/skill') { $env:MOCK_SKILLS_JSON }\n  else { throw 'Unexpected OpenCode call' }\n}\n`;
		return spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', `${mock}${script}`], {
			cwd: process.cwd(),
			encoding: 'utf8',
			env: { ...process.env, MOCK_SKILLS_JSON: JSON.stringify({ location: { directory: process.cwd() }, data }) },
		});
	};
	const valid = [entry('merge-upstream', mergePath), entry('local-build-deploy', deployPath)];
	const success = run(valid);
	assert.equal(success.error, undefined);
	assert.equal(success.status, 0, success.stderr);
	for (const data of [
		[entry('merge-upstream', deployPath), valid[1]],
		[valid[0], entry('local-build-deploy', mergePath)],
		[],
	]) {
		const failure = run(data);
		assert.notEqual(failure.status, 0, 'wrong path or empty API list must not pass');
		assert.match(failure.stderr, /OpenCode did not list the Markpad skill/);
	}
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
