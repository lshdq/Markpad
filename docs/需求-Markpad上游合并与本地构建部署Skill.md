# 需求：Markpad 上游合并与本地构建部署 Skill

## 背景与目标

Markpad 当前仓库是 `sftwrdotdev/Markpad` 的本地 fork，日常开发需要定期吸收官方上游变更，并在 Windows x64 环境完成前端、Rust、Tauri 全链路验证后，将便携版程序部署到本机固定目录。

本需求参考 `D:\works\thirdparty\opencode\.opencode\skills` 下的 `merge-upstream` 和 `win-adapt`，为 Markpad 创建两个项目级 OpenCode skill，把上游同步、安全审查、冲突处理、完整验证、本地构建和安全部署固化为可重复执行的流程。

## 功能描述

### 核心功能

1. 创建 `merge-upstream` skill，将官方 `upstream/master` 合并到 fork 的 `master`。
2. `merge-upstream` 执行前校验当前仓库、remote、分支和工作区状态。
3. `merge-upstream` 拉取上游后同时固定本地 master 基线 SHA 和待审查的上游 SHA，并基于这两个 SHA 输出领先/落后数量、待合并提交、目录变更摘要、风险点和安全审查结论。
4. `merge-upstream` 获得用户明确确认后才执行合并。
5. 合并冲突优先按“保留 fork 定制并吸收上游变更”原则自行解决；语义无法判断时再交由用户决策。
6. 合并完成后固定合并结果 SHA，并执行 Markpad 的完整前端、Rust 和 Windows Tauri 无签名构建验证。
7. 所有验证通过且 HEAD、master 仍指向已验证 SHA 后，`merge-upstream` 只把该固定 SHA 自动推送到 `origin/master`。
8. 创建 `local-build-deploy` skill，在 Windows x64 环境执行依赖安装、完整质量检查和 Tauri 无签名构建。
9. `local-build-deploy` 显式构建 `x86_64-pc-windows-msvc` target，通过 Cargo metadata 定位真实 target 目录，并校验新产物的版本、时间和 PE machine 后部署便携版 `Markpad.exe`，不运行 NSIS 安装器。
10. 部署前要求所有 Markpad 进程均已退出；skill 不得强制终止进程。
11. 部署时取得机器级命名 mutex，通过安装目录内的临时文件和 `File.Replace` 在同一原子操作中备份并替换 `D:\Program\Markpad\Markpad.exe`。
12. 部署后校验源文件和目标文件的 SHA256，并启动已部署程序完成冒烟验证。
13. 替换或冒烟验证失败时，保留或恢复替换前的可运行版本，并清晰报告失败位置。

### 边界与约束

1. 官方上游固定为 `https://github.com/sftwrdotdev/Markpad.git`，remote 名称固定为 `upstream`，目标分支固定为 `master`。
2. fork 固定为 `https://github.com/lshdq/Markpad.git`，remote 名称固定为 `origin`，目标分支固定为 `master`。
3. 当前仓库未配置 `upstream`；skill 发现 remote 缺失或地址不符时必须停止并给出修复命令，不得擅自修改 remote。
4. 工作区非干净状态时不得开始上游合并，不得自动 stash、提交、丢弃或覆盖用户改动。
5. 合并默认使用 `git merge <REVIEWED_UPSTREAM_SHA>`；只有用户明确要求并理解历史重写影响时才考虑 rebase。
6. 禁止向 `upstream` 推送，禁止 force push。
7. 上游安全审查至少覆盖数据外传、凭据泄漏、破坏性文件操作、远程下载执行、混淆代码、依赖脚本、Tauri 权限与命令、GitHub Actions 和发布配置。
8. `src-tauri/tauri.conf.json` 中 `plugins.updater.pubkey` 属于不可变安全配置；上游合并和冲突处理不得无意替换本地已发布公钥。
9. Windows 执行 Node 测试必须使用 `node --test --import tsx scripts/*.test.ts`，不能使用会导致 0 项测试的 `npm test`。
10. 本地构建使用 `npm run tauri build -- --no-sign --target x86_64-pc-windows-msvc`，不得要求、读取或生成 Tauri updater 私钥。
11. 本地部署只使用 Cargo metadata 派生的 `x86_64-pc-windows-msvc\release\Markpad.exe`，不得执行 `*-setup.exe`，不得修改卸载信息或安装器状态。
12. 不执行版本升级、提交、打标签、创建 GitHub release、触发发布工作流、发布 Chocolatey 或 Snap 包。
13. 不修改 Markpad 应用源码、构建脚本、updater endpoint 或 updater 公钥。
14. skill 仅面向当前 Windows x64 本机环境；跨平台发布继续以 `RELEASING.md` 和 GitHub Actions 为准。
15. skill 创建或更新后，应在 Markpad 项目上下文验证技能可发现性与加载内容；不能把其他工作区的 skill 列表视为本项目结果，不要求每次改动都重启 OpenCode。

## 输入输出

`merge-upstream` 输入：用户提出“合并上游”“同步上游”“merge upstream”“sync fork”等请求，以及可选的 merge/rebase 明确选择。

`merge-upstream` 输出：上游差异报告、安全审查结论、用户确认点、合并与冲突结果、完整验证结果、推送结果和最终分支状态。

`local-build-deploy` 输入：用户提出“本地构建”“构建并部署”“部署 Markpad”等请求，以及可选的“只构建不部署”限制。

`local-build-deploy` 输出：环境检查、质量检查、构建结果、产物路径和版本、备份路径、部署哈希、冒烟验证结果。默认构建成功后继续部署；用户明确要求只构建时才跳过部署。

## 非功能需求（性能/安全/兼容性）

1. skill 使用 OpenCode 标准的 `.opencode/skills/<name>/SKILL.md` 目录结构和合法 frontmatter。
2. skill 内容以当前仓库已有命令、目录和 CI 约束为事实来源，不引入额外运行时依赖或辅助脚本。
3. 每个可能改变 Git 历史、远端状态或本地安装文件的步骤均应具有清晰前置条件和失败停止规则；Git 审查必须固定本地和上游两个基线 SHA，合并、验证和推送必须固定到明确的结果 SHA。
4. 每个原生命令都必须检查退出码，任一步骤失败后不得越过失败继续推送或部署。
5. 构建与部署命令使用 PowerShell 7 兼容语法，并对包含空格的路径使用字面路径参数。
6. 部署使用跨终端会话的机器级 mutex 和同一卷、同一目录中的临时文件进行替换，避免并发部署或跨卷复制留下不一致目标。
7. 备份文件名包含旧版本、时间戳和 GUID，并由 `File.Replace` 与目标替换原子完成，避免覆盖已有备份或备份与替换之间的竞争。
8. 不记录、打印或持久化任何签名私钥、访问令牌或环境中的敏感值。
9. 保持非 Windows 平台的官方构建发布流程不变。

## 依赖

1. Git，以及已配置的 `origin` remote；首次真正合并前由用户配置正确的 `upstream` remote。
2. Node.js 24、npm 和已提交的 `package-lock.json`。
3. Rust stable、Cargo 和 Windows MSVC 构建工具链。
4. Tauri 2 CLI，通过项目 `devDependencies` 和 `npm run tauri` 调用。
5. 安装目录 `D:\Program\Markpad`；当前目录中已有便携版 `Markpad.exe`。
6. 项目质量门禁：`npm audit`、Svelte/TypeScript check、Node 测试、Vitest、rustfmt、Cargo test、Clippy 和 Tauri build。

## 验收标准

1. `.opencode/skills/merge-upstream/SKILL.md` 和 `.opencode/skills/local-build-deploy/SKILL.md` 均存在，目录名与 frontmatter `name` 一致，并包含可发现的中文、英文触发词。
2. `merge-upstream` 明确校验两组 remote URL、`master` 分支和干净工作区，remote 不符时不会自行修复。
3. `merge-upstream` 在合并前同时执行差异评估、安全审查和用户确认，缺少任一条件均不能合并。
4. `merge-upstream` 明确保护 fork 定制、updater 公钥和用户未提交改动。
5. `merge-upstream` 只有在完整验证成功后才自动推送 `origin/master`，并明确禁止推送 upstream 和 force push。
6. 两个 skill 的 Windows Node 全量测试命令均不会出现 0 项测试问题。
7. 完整验证包含 `npm audit`、`npm run check`、Node 测试、Vitest、`cargo fmt --check`、`cargo test`、`cargo clippy --all-targets -- -D warnings` 和无签名 Tauri 构建。
8. `local-build-deploy` 明确从 Cargo metadata 派生的 x64 target 目录部署本次新生成的 EXE，不运行 NSIS 安装器。
9. `local-build-deploy` 在 Markpad 进程存在时停止并要求用户退出，不调用 `Stop-Process`、`taskkill` 或同类强杀命令。
10. `local-build-deploy` 使用命名 mutex 串行化部署，通过 `File.Replace` 原子备份替换，并在部署后校验 SHA256。
11. `local-build-deploy` 把替换、校验和冒烟置于统一异常处理内，包含部署失败回滚及恢复哈希复核。
12. 两个 skill 均明确不执行发版、版本升级、标签、GitHub release 或包管理器发布。
13. 新增 Markdown 文件符合仓库 LF 约束，持久化契约测试和 `git diff --check` 通过。
14. 创建 skill 后按 V2 项目上下文验证步骤核对两个 ID；若动态查询无法确认，应报告未验证而非推断已加载。
