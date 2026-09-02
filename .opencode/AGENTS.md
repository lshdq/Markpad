# Markpad 项目指令

## 环境与验证

- 这是 Tauri 2 桌面应用：前端为 Svelte 5、TypeScript、Vite，后端为 `src-tauri/` 下的 Rust crate。CI 使用 Node 24 和 Rust stable，依赖安装使用 `npm ci`。
- `npm run dev` 只启动端口固定为 1420 的 Vite 前端；需要 Tauri API 的功能必须用 `npm run tauri dev`。完整产物使用 `npm run tauri build`，仅构建前端使用 `npm run build`。
- CI 的完整验证顺序是：

```bash
npm audit
npm run check
npm test
npm run test:vitest
cd src-tauri
cargo fmt --check
cargo test
cargo clippy --all-targets -- -D warnings
```

- 前端没有 ESLint 或 Prettier；`npm run check` 是 Svelte/TypeScript 检查，Rust 格式和 lint 由上述 Cargo 命令约束。
- `package.json` 的 Node 测试 glob 使用单引号，Windows 的 `cmd.exe` 会把它当成文件名，导致 `npm test` 显示 0 项测试；Windows 全量运行应使用 `node --test --import tsx scripts/*.test.ts`，并确认结果不是 0 项。
- 聚焦运行单个测试时不要把文件参数附加到 `npm test`，因为脚本自带全量 glob。使用：

```bash
node --test --import tsx scripts/example.test.ts
npm run test:vitest -- scripts/example.spec.ts
cd src-tauri && cargo test test_name
```

## 入口与职责

- `src/routes/+page.svelte` 只挂载 `src/lib/MarkdownViewer.svelte`；应用以 `ssr = false` 和静态适配器运行。`MarkdownViewer.svelte` 是前端编排入口，不要把可独立验证的逻辑继续堆入这个大型组件。
- `src/lib/sessions/documentSession.svelte.ts` 负责文档加载、保存、自动保存和外部修改冲突；`windowSession.svelte.ts` 负责窗口状态恢复和标签页转移；`stores/tabs.svelte.ts` 保存标签页状态。
- `Tab` 的三个内容字段不可互换：`rawContent` 是当前可编辑 Markdown，`originalContent` 是最近一次磁盘基线，`content` 是允许滞后的预览 HTML。保存文件只能使用 `rawContent`。
- Rust 启动链为 `src-tauri/src/main.rs` → `lib.rs` → `app.rs`。`tauri.conf.json` 的 `app.windows` 为空是有意的，窗口由 `app.rs` 动态创建。
- 前端可调用的命令不仅在 `commands.rs`，还分布于 `window_runtime.rs` 和 `tab_transfer.rs`；所有命令都必须加入 `app.rs` 的 `tauri::generate_handler!`。命令名是跨 Rust/TypeScript 的字符串契约，编译器不会检查两端拼写。
- 文件安全、编码识别和原子写入集中在 `src-tauri/src/fs_safety.rs`。前端不得使用 Node 文件系统 API；可编辑文本必须通过 `read_file_content_checked` 读取并把 `lossy`、`encoding` 一起传入标签页状态。不要恢复已删除的无检查读取命令。
- 可能阻塞的文件操作命令必须保持异步，并通过 `tauri::async_runtime::spawn_blocking` 执行，避免慢磁盘或网络卷冻结所有窗口。
- `app.rs` 注册了自定义异步 `asset:` 协议来避免不可达路径阻塞 WebView；修改本地资源加载时先阅读 `asset_protocol.rs` 及相关测试。

## 前端测试约定

- 两套运行器的 glob 不重叠：`npm test` 运行 `scripts/*.test.ts`（Node + `tsx`），`npm run test:vitest` 运行 `scripts/**/*.spec.ts`（Vitest + jsdom + Svelte 编译器）。
- 测试 `.svelte.ts` runes 模块、导入 `.svelte` 组件或需要真实 DOM 时使用 `*.spec.ts`；普通 TypeScript 和无需 Svelte 编译器的源码契约测试保留为 `*.test.ts`。不要用手写 `$state`、`$derived`、`$effect` shim 验证响应式行为。
- 行为可以直接执行时优先导入真实模块。源码文本断言只用于运行时无法证明的契约，例如 Rust/TypeScript 命令名、行为不存在第二份实现、组件内部必须保持的调用顺序。
- 读取源码统一使用 `scripts/sourceTree.ts` 的助手，它会规范化 CRLF。Vitest 下 `import.meta.url` 是 HTTP URL，因此 `*.spec.ts` 必须向 `readSource` 传仓库根目录相对字符串，不能传 `new URL(...)`。
- `vitest.config.ts` 的 `resolve.conditions: ['browser']` 是必需配置；删除后 Svelte 会解析到 SSR 构建，`$effect` 不刷新且 `$state` 不再是代理。
- 导入 `tabs.svelte.ts` 会连带启动 `settings` 单例。Vitest 的 `window.__TAURI_INTERNALS__` stub 必须让 `get_os_type` 返回 `macos`、`windows`、`linux` 或 `unknown`，需要窗口 API 时还要提供窗口 metadata。
- 测试中创建带 `$effect.root()` 的 store 必须在 `onTestFinished` 或 `finally` 中调用 `dispose()`；需要观察 effect 结果时用 Svelte 的 `flushSync()`。
- jsdom 提供 DOM 结构但不做 CSS 布局，`offsetTop`、`offsetHeight` 和默认 `getBoundingClientRect()` 都是 0；几何行为测试必须显式构造尺寸和矩形。

## 文件与发布约束

- `.gitattributes` 要求普通文本使用 LF，NSIS、PowerShell 和批处理文件使用 CRLF；非 UTF-8 编码样例是二进制测试夹具，不要让格式化或换行转换改写它们。
- 版本升级只运行 `npm run release X.Y.Z`。该命令同步 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/Cargo.lock`；不要手工编辑 Cargo lockfile，也不要让提交、打标签或推送混入脚本。
- 发布流程、平台产物和签名要求见 `RELEASING.md`。`src-tauri/tauri.conf.json` 中 `plugins.updater.pubkey` 已随客户端发布，除非维护者明确执行密钥迁移，否则绝不能修改；更换它会使现有客户端无法自动更新。
- 发布构建由 `Build and Release` 手动触发并先生成草稿；Chocolatey 和 Snap 仅在草稿被人工发布后由 `publish-packages.yml` 分发，不要把不可逆的包发布移回构建矩阵。
