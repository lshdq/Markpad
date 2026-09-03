# 需求：Properties 只读展示

## 背景与目标

Markpad 会将 Markdown 文档开头由两行 `---` 包围的 YAML front matter 解析为独立的 Properties 面板。当前面板默认收起，并通过输入框、下拉框和标签编辑控件允许直接修改属性值。

本需求将 Properties 调整为只读信息展示区域，避免其外观和交互暗示可直接编辑，同时提升长属性值的可读性，并让用户打开文档时立即看到属性内容。

## 功能描述

### 核心功能

1. 应用内 Properties 面板中的所有属性值只读展示。
2. 字符串、数字、布尔值、空值和对象均使用静态文本展示，不使用输入框、下拉框或文本域。
3. 列表值保留静态标签样式，但不允许编辑、添加或删除标签。
4. 普通属性值和列表标签在可用宽度不足时自动换行，不能通过省略号隐藏内容。
5. Properties 面板在每个文档首次显示时默认展开。
6. 用户仍可通过 Properties 标题栏手动展开或收起面板。
7. 用户手动设置的展开状态继续按当前文档隔离保存于本次应用会话中。
8. HTML 导出的 Properties 面板默认展开、保持只读，并支持长属性值自动换行。
9. Properties 面板是否显示必须只取决于当前活动文档，不能受首个打开文档是否包含 front matter 影响。
10. 在无 front matter 与有 front matter 的文档间切换时，Properties 面板必须随活动文档正确消失或重新显示。

### 边界与约束

1. 不修改 front matter 的识别规则、YAML 解析规则或 Markdown 正文分离逻辑。
2. 不改变无 front matter 文档的显示行为。
3. 不改变无效 front matter 的错误提示行为。
4. 不新增 Properties 属性名编辑、新增属性或删除属性能力。
5. Properties 面板不再提供任何修改 Markdown 原文的入口；用户需要在 Markdown 编辑器中修改 front matter。
6. 不持久化 Properties 展开状态到设置文件或磁盘，继续沿用组件会话内、按文档隔离的状态模型。
7. 桌面宽度和移动端窄屏布局均需完整显示属性值。
8. 不修改文档加载顺序、标签页内容状态或 front matter 解析结果，仅修正 Properties 组件的条件挂载生命周期。

## 输入输出

输入：Markdown 文档开头合法的 YAML mapping front matter，例如：

```markdown
---
title: A long document title
draft: false
tags: [markdown, desktop]
---

# Body
```

应用内输出：独立的 Properties 面板，默认展开，属性名和只读属性值成行展示，列表显示为不可交互的静态标签。

HTML 导出输出：带 `open` 属性的 Properties `<details>` 元素，其中不包含 `input`、`select`、`textarea` 或编辑按钮。

## 非功能需求（性能/安全/兼容性）

1. 不增加新的运行时依赖。
2. 使用 Svelte 默认文本转义展示属性值，不通过未净化 HTML 插入属性内容。
3. 长文本、包含换行的文本和无空格长字符串均不能造成面板横向溢出。
4. 保持 Svelte 5、TypeScript、Vite 和现有静态 HTML 导出流程兼容。
5. 删除不再使用的 Properties 编辑状态、处理函数和工具函数，避免保留不可达编辑路径。

## 依赖

1. 复用 `src/lib/utils/frontMatter.ts` 的 front matter 解析结果。
2. 复用现有 Properties 面板视觉样式和 `getFrontMatterListItems` 列表展示转换。
3. 复用原生 `<details>` / `<summary>` 展开收起行为。
4. HTML 导出继续使用 `src/lib/utils/exportHtml.ts` 和 `src/lib/utils/export.ts`。

## 验收标准

1. 打开含合法 front matter 的文档时，Properties 默认处于展开状态。
2. 手动收起后可以再次展开；切换文档时，各文档的手动状态互不影响。
3. Properties DOM 中不存在属性值编辑框、布尔下拉框、标签编辑按钮、标签删除按钮和标签添加入口。
4. 所有属性类型均能显示其现有 `displayValue`，列表项能按原顺序显示为静态标签。
5. 长普通值、多行值和长列表项在桌面及窄屏下自动换行，内容不被省略。
6. Properties 中的任何操作都不会修改 `rawContent` 或令标签页变为 dirty。
7. 导出的 HTML 中 Properties 默认展开，不含表单控件，并具备自动换行样式。
8. front matter 解析、Markdown 正文渲染、滚动同步及无效 front matter 错误展示的现有测试继续通过。
9. 首个打开的文档不含 front matter 时，后续打开含合法 front matter 的文档仍显示 Properties 面板。
10. 从无 front matter 文档切换到有 front matter 文档时显示面板，切回时隐藏，再次切回时重新显示并恢复该文档的折叠状态。
