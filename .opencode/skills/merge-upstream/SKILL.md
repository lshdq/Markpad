---
name: merge-upstream
description: 定期把 Markpad 官方上游(sftwrdotdev/Markpad)的 master 合并到本地 fork(lshdq/Markpad)的 master。触发关键词：合并上游、同步上游、merge upstream、sync fork、拉官方代码、更新 fork。包含 remote 与工作区检查、差异评估、合并前安全审查、用户确认、冲突处理、完整测试、Windows 无签名构建和自动推送。
---

# merge-upstream

把官方 `upstream/master` 合并进 fork 的 `master`。这是维护 fork 的专用流程，不用于发布 Markpad。

## 固定仓库拓扑

- `upstream` = `https://github.com/sftwrdotdev/Markpad.git`（官方，只读）
- `origin` = `https://github.com/lshdq/Markpad.git`（fork，可推送）
- 本地长期分支 = `master`
- 上游目标分支 = `upstream/master`

## 前置检查（每次必查）

1. 确认当前目录的仓库根是 Markpad，并读取 `git remote -v`。
2. 确认 `origin` 和 `upstream` 同时存在且 URL 与固定仓库拓扑一致。允许 URL 末尾有无 `.git` 的等价形式，不接受指向其他仓库。
3. 当前仓库尚未配置 `upstream` 时，停止并提示用户执行：

   ```powershell
   git remote add upstream https://github.com/sftwrdotdev/Markpad.git
   ```

   不得自行添加、删除或修改 remote。地址错误时同样停止，只报告现状和建议命令。
4. 使用 `git status --porcelain` 确认工作区和暂存区均为空。非空时停止并列出改动，不自动 stash、commit、reset、checkout、clean 或删除任何文件。
5. 当前分支不是 `master` 时，仅在工作区干净的前提下切换到 `master`。切换失败则停止。

## 流程

### 1. 获取上游

```powershell
git fetch upstream --tags --prune
if ($LASTEXITCODE -ne 0) { throw "git fetch upstream failed with exit code $LASTEXITCODE" }
$reviewedUpstreamSha = (git rev-parse upstream/master).Trim()
if ($LASTEXITCODE -ne 0 -or $reviewedUpstreamSha -notmatch '^[0-9a-f]{40}$') {
    throw "Cannot resolve upstream/master to a commit"
}
$reviewedMasterSha = (git rev-parse master).Trim()
if ($LASTEXITCODE -ne 0 -or $reviewedMasterSha -notmatch '^[0-9a-f]{40}$') {
    throw "Cannot resolve master to a commit"
}
Write-Output "[upstream] reviewed-sha=$reviewedUpstreamSha"
Write-Output "[fork] reviewed-master-sha=$reviewedMasterSha"
```

网络失败时按 GitHub 网络重试流程处理；不要因 fetch 失败而使用陈旧的 `upstream/master` 继续合并。记录输出的两个 40 位 SHA，并在后续报告和命令中替换对应占位符；等待用户确认会跨越 shell 会话，不能依赖 PowerShell 变量继续存在。

### 2. 评估差异

至少执行并解释以下结果：

```powershell
$reviewedUpstreamSha = "<REVIEWED_UPSTREAM_SHA>"
$reviewedMasterSha = "<REVIEWED_MASTER_SHA>"
if ($reviewedUpstreamSha -notmatch '^[0-9a-f]{40}$') { throw "Paste the reviewed 40-character upstream SHA" }
if ($reviewedMasterSha -notmatch '^[0-9a-f]{40}$') { throw "Paste the reviewed 40-character master SHA" }
git rev-list --left-right --count "${reviewedMasterSha}...$reviewedUpstreamSha"
if ($LASTEXITCODE -ne 0) { throw "git rev-list failed with exit code $LASTEXITCODE" }
git log --oneline --decorate "${reviewedMasterSha}..$reviewedUpstreamSha"
if ($LASTEXITCODE -ne 0) { throw "incoming git log failed with exit code $LASTEXITCODE" }
git log --oneline --decorate "${reviewedUpstreamSha}..$reviewedMasterSha"
if ($LASTEXITCODE -ne 0) { throw "fork git log failed with exit code $LASTEXITCODE" }
git diff --stat "${reviewedMasterSha}...$reviewedUpstreamSha"
if ($LASTEXITCODE -ne 0) { throw "git diff --stat failed with exit code $LASTEXITCODE" }
git diff --name-status "${reviewedMasterSha}...$reviewedUpstreamSha"
if ($LASTEXITCODE -ne 0) { throw "git diff --name-status failed with exit code $LASTEXITCODE" }
```

- `rev-list` 第一列是 fork 独有提交数，第二列是上游待合并提交数。
- `<REVIEWED_MASTER_SHA>..<REVIEWED_UPSTREAM_SHA>` 是将并入的上游提交。
- `<REVIEWED_UPSTREAM_SHA>..<REVIEWED_MASTER_SHA>` 用于理解 Properties 只读展示、OpenCode 配置等 fork 定制。
- 对比双方改动路径，指出上游是否触及 fork 自有提交修改过的文件，以及潜在冲突和行为回归。
- 没有待合并提交时停止，报告“已与上游同步”，不创建空合并、不测试、不推送。

### 3. 安全审查（合并前强制）

审查 `git diff <REVIEWED_MASTER_SHA>...<REVIEWED_UPSTREAM_SHA>`，不能只看提交标题。所有审查命令必须使用第 1 步记录的两个字面 SHA，不能重新解析可能移动的 `master` 或 `upstream/master`。每条 Git 命令执行后立即检查 `$LASTEXITCODE`。数据量大时先按 diff stat 和高敏路径筛选，再查看具体修改。

必须检查：

- 数据外传：新增陌生域名、遥测、上传文档内容、token、凭据、环境变量或本机信息。
- 数据破坏：删除、篡改、加密用户文件，危险 shell、递归删除、越权路径访问。
- 下载与执行：远程脚本下载即运行、`eval`、解码后执行、可疑二进制或安装钩子。
- 依赖供应链：`package.json`、`package-lock.json`、`Cargo.toml`、`Cargo.lock` 的新增依赖、脚本和来源变化。
- Tauri 攻击面：commands、capabilities、permissions、asset protocol、CSP、shell/process、文件系统与 updater 变更。
- CI 与发布：`.github/workflows/`、`RELEASING.md`、安装器、签名、release 和包管理器发布逻辑。
- 永久 updater 公钥：`src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey` 不得被无意替换。若上游修改该值，必须单独列为阻塞风险交给用户判断。

发现可疑项时立即停止，逐条给出 `file:line`、行为、风险和需要用户判断的问题。用户明确判定安全前不得合并。

### 4. 变更说明与用户确认（合并前强制）

向用户提供：

- fork 独有提交数、上游待合并提交数和待合并提交清单。
- 按模块或目录归纳的主要变更。
- 安全审查结论及所有高敏文件变化。
- 上游与 fork 修改重叠的文件、预期冲突和行为风险。
- 合并后的验证清单，以及验证成功后将自动推送 `origin/master` 的明确说明。

等待用户明确确认。未获确认不得执行合并。

### 5. 合并

默认使用 merge：

```powershell
$reviewedUpstreamSha = "<REVIEWED_UPSTREAM_SHA>"
$reviewedMasterSha = "<REVIEWED_MASTER_SHA>"
if ($reviewedUpstreamSha -notmatch '^[0-9a-f]{40}$') { throw "Paste the reviewed 40-character upstream SHA" }
if ($reviewedMasterSha -notmatch '^[0-9a-f]{40}$') { throw "Paste the reviewed 40-character master SHA" }
$currentUpstreamSha = (git rev-parse upstream/master).Trim()
if ($LASTEXITCODE -ne 0) { throw "Cannot re-resolve upstream/master" }
$currentMasterSha = (git rev-parse master).Trim()
if ($LASTEXITCODE -ne 0) { throw "Cannot re-resolve master" }
$currentHeadSha = (git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw "Cannot re-resolve HEAD" }
$currentBranch = (git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) { throw "Cannot resolve the current branch" }
$currentStatus = @(git status --porcelain)
if ($LASTEXITCODE -ne 0) { throw "git status failed with exit code $LASTEXITCODE" }
if ($currentUpstreamSha -ne $reviewedUpstreamSha) {
    throw "upstream/master moved after review; fetch and review again"
}
if ($currentBranch -ne "master" -or $currentMasterSha -ne $reviewedMasterSha -or $currentHeadSha -ne $reviewedMasterSha -or $currentStatus.Count -ne 0) {
    throw "The current branch, master, HEAD or the worktree changed after review; review again"
}
git -c core.editor=true merge $reviewedUpstreamSha
$mergeExitCode = $LASTEXITCODE
if ($mergeExitCode -ne 0) {
    $conflictedFiles = @(git diff --name-only --diff-filter=U)
    if ($LASTEXITCODE -ne 0) { throw "Cannot inspect merge conflicts" }
    if ($conflictedFiles.Count -eq 0) { throw "git merge failed without resolvable file conflicts (exit $mergeExitCode)" }
    Write-Output "[merge] conflicts=$($conflictedFiles.Count); continue with the conflict section"
}
```

不强制创建无必要的 merge commit，也不改写默认合并信息。没有冲突时直接进入第 7 步；有冲突时先执行第 6 步。只有用户明确要求 rebase 且已知晓历史重写影响时才改用 rebase；本 skill 默认流程禁止 force push，因此通常不选择 rebase。

### 6. 冲突处理

1. 使用 `git diff --name-only --diff-filter=U` 列出冲突文件。
2. 先查看 `git log <REVIEWED_UPSTREAM_SHA>..<REVIEWED_MASTER_SHA>`、fork 自有提交及冲突文件历史，理解本地定制目的。
3. 按“保留 fork 定制 + 吸收上游修复”的原则逐处解决，不能盲目使用 ours/theirs 覆盖整个文件。
4. 特别保护 Properties 只读展示、项目级 `.opencode` 配置，以及 `plugins.updater.pubkey`。
5. 语义确实无法兼容或无法判断时停止，向用户说明两侧行为和可选方案。
6. 解决后只暂存明确处理过的文件，再执行以下命令。用户要求放弃时使用 `git merge --abort`。

   ```powershell
   git -c core.editor=true merge --continue
   if ($LASTEXITCODE -ne 0) { throw "git merge --continue failed with exit code $LASTEXITCODE" }
   ```

禁止丢弃用户工作、删除 fork 定制、跳过未解决冲突或绕过 Git 安全检查。

### 7. 固定合并结果

无论第 5 步无冲突完成，还是第 6 步通过 `git merge --continue` 完成，都在继续验证前统一执行：

```powershell
$unresolved = @(git diff --name-only --diff-filter=U)
if ($LASTEXITCODE -ne 0) { throw "Cannot inspect unresolved conflicts" }
if ($unresolved.Count -ne 0) { throw "Merge still has unresolved conflicts" }
$mergeResultSha = (git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $mergeResultSha -notmatch '^[0-9a-f]{40}$') {
    throw "Cannot record the merge result commit"
}
Write-Output "[merge] result-sha=$mergeResultSha"
```

把输出的结果 SHA 记录为 `<VALIDATED_MERGE_SHA>`，后续验证和推送都固定到该字面量。

### 8. 完整验证

合并成功后按以下顺序验证。任一步骤失败都停止，不推送，并报告命令、退出码和关键错误。不要自动回滚已经完成的合并，让用户决定修复或 `git merge --abort`（仍处于合并状态时）。

```powershell
npm ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
npm audit
if ($LASTEXITCODE -ne 0) { throw "npm audit failed with exit code $LASTEXITCODE" }
npm run check
if ($LASTEXITCODE -ne 0) { throw "npm run check failed with exit code $LASTEXITCODE" }
node --test --import tsx scripts/*.test.ts
if ($LASTEXITCODE -ne 0) { throw "Node tests failed with exit code $LASTEXITCODE" }
npm run test:vitest
if ($LASTEXITCODE -ne 0) { throw "Vitest failed with exit code $LASTEXITCODE" }

Push-Location src-tauri
try {
    cargo fmt --check
    if ($LASTEXITCODE -ne 0) { throw "cargo fmt --check failed with exit code $LASTEXITCODE" }
    cargo test
    if ($LASTEXITCODE -ne 0) { throw "cargo test failed with exit code $LASTEXITCODE" }
    cargo clippy --all-targets -- -D warnings
    if ($LASTEXITCODE -ne 0) { throw "cargo clippy failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

npm run tauri build -- --no-sign
if ($LASTEXITCODE -ne 0) { throw "Tauri build failed with exit code $LASTEXITCODE" }
```

Windows 下不能用 `npm test` 代替 Node 测试命令：脚本中的单引号 glob 会被 `cmd.exe` 当成文件名，可能静默运行 0 项测试。

验证结束后再次检查 `git status --short`，并确认 `git rev-parse HEAD` 与 `git rev-parse master` 都仍等于 `<VALIDATED_MERGE_SHA>`。只允许合并本身产生的预期状态和被 `.gitignore` 排除的构建产物；出现新的已跟踪文件修改或 ref 变化时停止并调查，不把意外生成文件或未经验证的提交混入推送。

### 9. 自动推送

全部验证通过后，再次确认 `origin` 指向 `lshdq/Markpad`，然后自动推送：

```powershell
$validatedMergeSha = "<VALIDATED_MERGE_SHA>"
if ($validatedMergeSha -notmatch '^[0-9a-f]{40}$') { throw "Paste the validated 40-character merge SHA" }
$headSha = (git rev-parse HEAD).Trim()
$masterSha = (git rev-parse master).Trim()
if ($LASTEXITCODE -ne 0 -or $headSha -ne $validatedMergeSha -or $masterSha -ne $validatedMergeSha) {
    throw "HEAD or master moved after validation; do not push"
}
git push origin "${validatedMergeSha}:refs/heads/master"
if ($LASTEXITCODE -ne 0) { throw "git push origin master failed with exit code $LASTEXITCODE" }
```

固定 SHA 的普通 push 确保只推送本次已经验证的提交；若远端已经前进，普通非快进保护会拒绝推送。网络失败时可以重试同一个固定 SHA push。禁止推送到 upstream，禁止 `--force`、`--force-with-lease` 和任何历史覆盖操作。

### 10. 汇总

报告：

- 合并前后的提交 ID、并入提交数和 fork 领先/落后状态。
- 冲突文件数及处理结果。
- 安全审查结论。
- 每项验证结果和 Tauri 产物路径。
- `origin/master` 推送结果。

## 不在本流程内

- 不部署或启动 `D:\Program\Markpad\Markpad.exe`；本地部署使用 `local-build-deploy` skill。
- 不升级版本，不运行 `npm run release`，不提交额外版本改动。
- 不创建 tag、GitHub release 或触发 `build.yml`。
- 不发布 Chocolatey、Snap 或其他分发包。
- 不修改 updater endpoint、签名密钥或 updater 公钥。

## 安全规则

- 工作区不干净、remote 不符、fetch 失败、安全审查存疑或用户未确认：不得合并。
- 合并、冲突处理或任一验证失败：不得推送。
- 只有完整验证成功后才自动推送到经过核验的 `origin/master`。
- 绝不向 upstream 推送，绝不 force push，绝不擅自处理或丢弃用户已有改动。

## 配置加载提示

本 skill 文件被创建或更新后，在 Markpad 项目上下文核对 skill 的 ID 和加载内容；若当前会话仍使用旧内容，重新打开会话再验证。V2 文档未要求每次修改项目级 skill 都必须退出并重启 OpenCode，不把重启当作生效的前置条件。
