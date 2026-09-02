# 测试用例：Properties 只读展示

## 测试范围

覆盖应用内 Properties 面板的默认展开、手动折叠、文档状态隔离、全类型只读展示、自动换行，以及 HTML 导出的一致行为。回归验证 front matter 解析、正文分离和相关前端功能不受影响。

## 用例列表

### TC-001: Properties 首次显示时默认展开
- 前置条件：打开含合法 YAML mapping front matter 的 Markdown 文档。
- 操作步骤：进入文档预览，定位 Properties 面板。
- 预期结果：Properties 的 `<details>` 具有展开状态，属性列表立即可见。
- 优先级：P0

### TC-002: Properties 可以手动收起和展开
- 前置条件：Properties 面板已默认展开。
- 操作步骤：依次点击 Properties 标题栏收起并再次展开。
- 预期结果：面板按操作切换状态，标题栏和箭头状态同步更新。
- 优先级：P0

### TC-003: 展开状态按文档隔离
- 前置条件：同时打开两个均含 front matter 的文档。
- 操作步骤：收起文档 A 的 Properties，切换到文档 B，再切回文档 A。
- 预期结果：文档 B 首次显示时默认展开；文档 A 恢复其已收起状态。
- 优先级：P1

### TC-004: 所有属性类型均为只读
- 前置条件：front matter 包含字符串、数字、布尔值、空值、对象和列表。
- 操作步骤：检查 Properties 面板 DOM 和可交互元素。
- 预期结果：各属性值正确显示；不存在 `input`、`select`、`textarea`，也不存在编辑、添加或删除属性值的按钮。
- 优先级：P0

### TC-005: 列表显示为静态标签
- 前置条件：front matter 包含多个列表项。
- 操作步骤：查看列表属性并尝试点击列表标签。
- 预期结果：列表项按原顺序显示为标签；标签不可编辑且没有删除或新增入口。
- 优先级：P0

### TC-006: 普通长属性值自动换行
- 前置条件：字符串属性包含超出面板宽度的文本和无空格长字符串。
- 操作步骤：分别在桌面宽度和小于 720px 的窄屏宽度查看 Properties。
- 预期结果：文本在值列内自动换行，无水平溢出、截断或省略号。
- 优先级：P0

### TC-007: 多行属性值保留换行
- 前置条件：YAML 属性解析后的展示值中包含换行。
- 操作步骤：查看对应静态值。
- 预期结果：静态值按现有内容保留换行，并可继续在长行内自动折行。
- 优先级：P1

### TC-008: 长列表项自动换行
- 前置条件：列表中包含超出值列宽度的长项目。
- 操作步骤：分别在桌面和窄屏宽度查看列表标签。
- 预期结果：标签容器及标签内容均可换行，完整内容可见且不显示省略号。
- 优先级：P0

### TC-009: Properties 操作不修改文档
- 前置条件：打开未修改的含 front matter 文档。
- 操作步骤：收起、展开 Properties，并点击静态属性值和列表标签。
- 预期结果：标签页 `rawContent` 不变，文档不会因 Properties 操作变为 dirty。
- 优先级：P0

### TC-010: HTML 导出 Properties 默认展开且只读
- 前置条件：文档包含普通值、布尔值和列表值。
- 操作步骤：生成静态 Properties HTML。
- 预期结果：`<details>` 具有 `open` 属性；属性值和列表项存在；HTML 中不包含 `input`、`select`、`textarea` 或 `button`。
- 优先级：P0

### TC-011: HTML 导出长值自动换行
- 前置条件：文档包含长普通值和长列表项。
- 操作步骤：生成完整导出 HTML 并检查 Properties 相关样式。
- 预期结果：静态值及列表标签具备保留换行和任意位置折行规则，不会横向溢出。
- 优先级：P1

### TC-012: 无 front matter 文档保持原行为
- 前置条件：Markdown 文档开头没有合法 front matter。
- 操作步骤：打开预览并执行 HTML 导出。
- 预期结果：应用内和导出结果均不显示 Properties 面板，Markdown 正文不被截除。
- 优先级：P1

### TC-013: 无效 front matter 保持错误展示
- 前置条件：文档包含已识别但 YAML 语法无效的 front matter。
- 操作步骤：打开文档预览。
- 预期结果：Properties 默认展开并显示原有解析错误，不显示属性编辑控件。
- 优先级：P1

### TC-014: Front matter 解析与正文分离回归
- 前置条件：准备 LF、CRLF、合法 mapping、空 mapping、非首行分隔线及 prose block 样例。
- 操作步骤：运行 front matter 聚焦测试。
- 预期结果：识别、解析、行尾和正文分离行为与修改前一致。
- 优先级：P0

## 测试命令

```powershell
npm run test:frontmatter
npm run test:vitest -- scripts/frontMatterPanel.spec.ts
node --test --import tsx scripts/exportHtml.test.ts
npm run check
node --test --import tsx scripts/*.test.ts
npm run test:vitest
npm run build
```

完整 CI 回归命令：

```powershell
npm audit
npm run check
node --test --import tsx scripts/*.test.ts
npm run test:vitest
Push-Location src-tauri
cargo fmt --check
cargo test
cargo clippy --all-targets -- -D warnings
Pop-Location
```

## 测试场景分类

通用前端功能。包含 Svelte 组件行为测试、TypeScript 工具函数回归测试、静态 HTML 导出测试、CSS 展示契约验证和完整构建验证；不涉及外部接口或服务集成测试。
