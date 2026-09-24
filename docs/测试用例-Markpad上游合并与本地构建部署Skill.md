# 测试用例：Markpad 上游合并与本地构建部署 Skill

## 测试范围

本次变更是项目级 OpenCode 工作流定义，测试以文档契约审查和静态命令核对为主。覆盖 skill 可发现性、仓库与 remote 门禁、合并前确认、安全审查、完整验证、自动推送、安全部署、备份回滚及禁止行为。

真实 `git fetch`、合并、推送、程序覆盖、进程启动和发布操作不在文档验证阶段执行，避免改变远端仓库或本机安装状态。

## 用例列表

### TC-001: Skill 目录和 frontmatter 合法
- 前置条件：两个 skill 文件已创建。
- 操作步骤：检查文件路径、文件名和 frontmatter。
- 预期结果：文件分别位于 `.opencode/skills/merge-upstream/SKILL.md` 和 `.opencode/skills/local-build-deploy/SKILL.md`；`name` 与目录名一致；`description` 非空。
- 优先级：P0

### TC-002: 合并 Skill 可被常用关键词发现
- 前置条件：`merge-upstream` skill 已创建。
- 操作步骤：检查 `description` 中的触发词。
- 预期结果：包含“合并上游”“同步上游”“merge upstream”“sync fork”等中英文关键词。
- 优先级：P1

### TC-003: 构建部署 Skill 可被常用关键词发现
- 前置条件：`local-build-deploy` skill 已创建。
- 操作步骤：检查 `description` 中的触发词。
- 预期结果：包含“本地构建”“构建并部署”“部署 Markpad”等关键词，并说明默认构建后部署。
- 优先级：P1

### TC-004: Remote 和分支校验正确
- 前置条件：`merge-upstream` skill 已创建。
- 操作步骤：检查前置条件中的仓库拓扑。
- 预期结果：`upstream` 固定指向 `https://github.com/sftwrdotdev/Markpad.git`，`origin` 固定指向 `https://github.com/lshdq/Markpad.git`，双方分支均为 `master`。
- 优先级：P0

### TC-005: 缺失 Upstream 时失败关闭
- 前置条件：当前仓库实际未配置 `upstream`。
- 操作步骤：审查 skill 中 remote 缺失的处理规则。
- 预期结果：流程停止并提示正确的 `git remote add upstream` 命令；未经用户明确操作不会修改 remote。
- 优先级：P0

### TC-006: 脏工作区不会进入合并
- 前置条件：仓库存在已修改或未跟踪文件。
- 操作步骤：审查工作区前置检查和失败处理。
- 预期结果：流程停止并列出状态，不自动 stash、commit、reset、checkout 或删除文件。
- 优先级：P0

### TC-007: 合并前差异评估完整
- 前置条件：已成功获取 `upstream/master`。
- 操作步骤：检查差异评估命令和输出要求。
- 预期结果：获取后记录 40 位本地 master SHA 和上游 SHA；待合并提交、领先/落后数量、diff stat、fork 自有提交和双方触及相同文件的风险分析均固定到这两个 SHA；合并前重新检查两个 ref、HEAD 和干净工作区。
- 优先级：P1

### TC-008: 合并前强制安全审查
- 前置条件：存在待合并上游提交。
- 操作步骤：检查安全审查范围和停止条件。
- 预期结果：覆盖网络外传、凭据、破坏性操作、远程执行、依赖脚本、Tauri 权限、工作流和发布配置；发现可疑项时在合并前停止。
- 优先级：P0

### TC-009: Updater 公钥受到保护
- 前置条件：上游 diff 或冲突涉及 `src-tauri/tauri.conf.json`。
- 操作步骤：检查冲突和安全审查规则。
- 预期结果：`plugins.updater.pubkey` 被标记为不可无意修改的敏感契约；不能盲目接受上游版本。
- 优先级：P0

### TC-010: 未确认时不能合并
- 前置条件：差异评估和安全审查已完成，但用户尚未明确确认。
- 操作步骤：检查合并门禁。
- 预期结果：不会执行 `git merge` 或 `git rebase`。
- 优先级：P0

### TC-011: 冲突处理保留 Fork 定制
- 前置条件：上游与 fork 修改同一文件并产生冲突。
- 操作步骤：检查冲突处理原则和决策升级规则。
- 预期结果：先理解 fork 自有提交与相关业务意图，再组合双方变更；无法判断语义时停止并询问用户，不盲目选择任意一侧。
- 优先级：P0

### TC-012: Windows Node 测试不会静默运行零项
- 前置条件：任一 skill 执行完整验证。
- 操作步骤：检查 Node 测试命令。
- 预期结果：使用 `node --test --import tsx scripts/*.test.ts`，不使用 Windows `cmd.exe` 会误解析单引号 glob 的 `npm test`。
- 优先级：P0

### TC-013: 完整质量门禁齐全
- 前置条件：合并完成或本地构建开始。
- 操作步骤：逐项核对验证命令和顺序。
- 预期结果：包含 `npm audit`、`npm run check`、Node 测试、`npm run test:vitest`、`cargo fmt --check`、`cargo test` 和 `cargo clippy --all-targets -- -D warnings`，每个原生命令后均立即检查非零退出码。
- 优先级：P0

### TC-014: Tauri 本地构建不要求签名密钥
- 前置条件：质量门禁全部通过。
- 操作步骤：检查 Tauri 构建命令和敏感信息规则。
- 预期结果：使用 `npm run tauri build -- --no-sign --target x86_64-pc-windows-msvc`；不读取、生成或打印 `TAURI_SIGNING_PRIVATE_KEY`。
- 优先级：P0

### TC-015: 验证失败时不会推送
- 前置条件：上游已合并，但任一验证命令失败。
- 操作步骤：检查失败路径。
- 预期结果：流程停止并报告失败；不会执行 `git push`。
- 优先级：P0

### TC-016: 验证通过后自动推送到 Fork
- 前置条件：合并已确认、完成且所有验证成功。
- 操作步骤：检查推送步骤和目标保护。
- 预期结果：推送前确认 HEAD 和 master 仍等于已验证 SHA，再把该固定 SHA 推送到 `refs/heads/master`；确认 `origin` 是 fork；不存在向 upstream 推送或 force push 的命令。
- 优先级：P0

### TC-017: 本地部署仅使用便携版产物
- 前置条件：Windows Tauri 构建成功。
- 操作步骤：检查部署源路径和安装器处理。
- 预期结果：源文件由 Cargo metadata 的 target 目录派生，位于显式 `x86_64-pc-windows-msvc\release` 下；不会执行 `release\bundle\nsis\*-setup.exe`。
- 优先级：P0

### TC-018: 构建产物版本经过校验
- 前置条件：便携版产物存在。
- 操作步骤：检查版本读取和一致性规则。
- 预期结果：构建前删除准确目标路径的旧 EXE；从本次新文件的 Windows `ProductVersion` 读取实际版本并与项目版本契约核对，同时验证生成时间和 x64 PE machine；不根据文件名或构建日志猜测版本。
- 优先级：P1

### TC-019: 运行中的 Markpad 不会被强杀或覆盖
- 前置条件：存在 Markpad 进程。
- 操作步骤：检查进程门禁和禁止命令。
- 预期结果：部署停止并要求用户自行退出；不使用 `Stop-Process`、`taskkill` 或安装器强制关闭程序。
- 优先级：P0

### TC-020: 旧程序与替换原子备份
- 前置条件：`D:\Program\Markpad\Markpad.exe` 已存在且进程已退出。
- 操作步骤：检查备份文件名和替换顺序。
- 预期结果：备份名包含旧版本、时间戳和 GUID；通过 `File.Replace` 在替换目标的同一个原子操作中创建备份，不覆盖已有备份。
- 优先级：P0

### TC-021: 程序通过同目录临时文件原子替换
- 前置条件：构建产物、安装目录和备份均可用。
- 操作步骤：检查复制和替换流程。
- 预期结果：机器级命名 mutex 跨终端会话覆盖进程复查至冒烟/回滚；先复制到 `D:\Program\Markpad` 内的唯一临时文件并校验，再通过同卷替换更新 `Markpad.exe`；不会直接向活动目标执行长时间覆盖写入。
- 优先级：P0

### TC-022: 部署后校验 SHA256
- 前置条件：目标文件已替换。
- 操作步骤：检查部署校验。
- 预期结果：构建阶段记录的 SHA256、部署前重新读取的源文件 SHA256 和已部署文件 SHA256 完全一致；任一不一致时部署判定失败并执行对应停止或回滚规则。
- 优先级：P0

### TC-023: 冒烟验证失败可回退
- 前置条件：目标文件已替换并尝试启动。
- 操作步骤：检查启动存活判断、失败处理和备份使用规则。
- 预期结果：已部署程序正常启动并保持运行时部署成功；启动抛错、刷新失败或早退均进入统一回滚，恢复后再次核对旧文件哈希；目标被锁定导致回滚失败时明确报告且不强杀进程。
- 优先级：P0

### TC-024: 明确只构建时不部署
- 前置条件：用户明确要求“只构建、不部署”。
- 操作步骤：检查可选流程分支。
- 预期结果：完成质量检查和无签名构建后报告产物，不检查进程、不替换安装文件、不启动部署目标。
- 优先级：P1

### TC-025: 发布操作明确排除
- 前置条件：任一 skill 被调用。
- 操作步骤：检查边界和禁止行为。
- 预期结果：不会升级版本、提交、打标签、创建 release、触发 `build.yml`、发布 Chocolatey 或 Snap 包，也不会修改 updater endpoint 或公钥。
- 优先级：P0

### TC-026: OpenCode 项目上下文加载提示
- 前置条件：skill 文件已创建。
- 操作步骤：检查完成说明。
- 预期结果：要求在 Markpad 项目上下文核对 skill 的 ID 和加载内容；未验证时不得断言已生效，不将重启作为必需前置条件。
- 优先级：P1

## 测试命令

文档和 skill 静态验证：

```powershell
git diff --check
git status --short
git diff -- docs/ .opencode/skills/
node --test --import tsx scripts/opencodeSkills.test.ts
```

`scripts/opencodeSkills.test.ts` 直接读取两个 skill，因此即使文件尚未被 Git 跟踪，也会验证 frontmatter、触发词、固定 SHA、原生命令退出码、目标架构、互斥锁、事务回滚、安全门禁和禁止行为。

**首选动态验证（只读，不执行 skill 正文步骤）**：在工作目录确认为 Markpad 仓库根目录的 OpenCode 会话中，检查会话提供的可用 skill 列表是否包含 `merge-upstream` 和 `local-build-deploy`；再分别用 `skill` 工具按这两个 ID 只读加载。检查返回的 `Base directory for this skill` 分别为本仓库的 `.opencode/skills/merge-upstream` 和 `.opencode/skills/local-build-deploy`，核对正文标题与安全规则。若任一 ID 不可用、加载失败、基目录不是当前 Markpad 仓库，报告未验证，不触发合并、构建或部署。本次 Markpad 会话的两个 ID 均已在 `available_skills` 显示，且 `skill` 工具加载后的基目录均为本仓库对应目录。

**可选 API 诊断**：从 Markpad 仓库根目录执行下列只读查询。V2 `/api/skill` 响应包含 `location`、`data`；`data` 中的 `Skill.Info` 含 `id` 和 `path`（见 [V2 API 规范](https://opencode.ai/v2/openapi.json)）。`--standalone` 避开当前可能属于其他项目的共享服务，并分别检查两个响应的 location。只有两个目标 ID 的条目各自 `path` 都能解析到本仓库对应的 `SKILL.md`，才认定 API 清单验证通过；同 ID 被全局或显式 skill 覆盖不能算通过。API 返回空清单不等于当前会话无法加载 skill，不把下面的脚本当作唯一或强制验证方法；如与 `skill` 工具结果不一致，分别记录结果和版本，不猜测根因。

```powershell
$root = (Resolve-Path -LiteralPath (git rev-parse --show-toplevel)).Path
if ($LASTEXITCODE -ne 0 -or (Get-Location).Path -ne $root) { throw 'Run from the Markpad repository root' }
foreach ($id in @('merge-upstream', 'local-build-deploy')) {
    if (-not (Test-Path -LiteralPath ".opencode/skills/$id/SKILL.md" -PathType Leaf)) { throw "Missing Markpad skill: $id" }
}
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null
$location = opencode api --standalone get /api/location | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $location.directory -ne $root) { throw 'OpenCode location is not the Markpad repository root' }
$skills = opencode api --standalone get /api/skill | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $skills.location.directory -ne $root) { throw 'Skill list is not from the Markpad repository root' }
foreach ($id in @('merge-upstream', 'local-build-deploy')) {
    $expectedPath = (Resolve-Path -LiteralPath ".opencode/skills/$id/SKILL.md").Path
    $matching = @($skills.data | Where-Object {
        if ($_.id -cne $id -or $_.path -isnot [string]) { return $false }
        $actualPath = Resolve-Path -LiteralPath $_.path -ErrorAction SilentlyContinue
        $null -ne $actualPath -and $actualPath.Path -eq $expectedPath
    })
    if ($matching.Count -ne 1) { throw "OpenCode did not list the Markpad skill at $expectedPath : $id" }
}
```

当前 Windows CLI v2.0.16 在该 `--standalone` location 下返回 `data: []`，所以上述可选 API 清单验证目前不通过；这与本项目会话 `skill` 工具已加载两项 skill 的结果分别记录。若 CLI/API 无法列出项目 skill，按 [V2 Skills 排障指引](https://opencode.ai/v2/docs/skills#troubleshooting)检查目录、重复 ID 和权限，不要误报 API 清单通过；V2 CLI 可用子命令以 `opencode --help`、`opencode api --help` 为准。

本次文档验证阶段不执行以下具有副作用的命令：

```text
git fetch
git merge
git push
npm ci
npm run tauri build
复制或替换 D:\Program\Markpad\Markpad.exe
启动或终止 Markpad 进程
```

## 测试场景分类

文档验证。测试对象是 OpenCode skill 的工作流契约，不涉及 Markpad 业务代码、外部接口或真实发布。真实上游合并和本地程序部署应在用户后续显式调用对应 skill 时，按 skill 自身门禁执行。
