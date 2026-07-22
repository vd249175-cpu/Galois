---
icon: 🧪
tags:
  - Galois
  - 渲染验收
  - Markdown
  - 程序生成
---
# 完整 Markdown 与程序生成验收

这一页是可操作的验收基准，不是只用来阅读的说明。请分别在 Live Preview 和 Reading 模式测试。 #验收/编辑器

## 1. 行内格式与导航

**粗体**、*斜体*、***粗斜体***、`inline code`、$E = mc^2$、<kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd>。

- WikiLink：[[00_新手指引|打开新手指引]]
- Markdown 文件链接：[Markdown 与 Mermaid](07_表格与绘图演示.md)
- 外部链接：[Galois 项目链接占位](https://example.com)

## 2. 列表、嵌套勾选与引用

- [ ] 点击勾选后应回写 Markdown
  - [ ] 嵌套勾选也应可用
- [x] 已完成项可取消

> [!NOTE]
> Callout 目前使用引用块容器渲染；不要向 Agent 宣称存在未实现的独立 Callout 组件。

## 3. 可编辑表格

| 字段 | 格式 | 可交互状态 |
| :--- | :--- | :---: |
| 标题 | **粗体** | [ ] |
| 快捷键 | <kbd>⌘</kbd> + <kbd>K</kbd> | [x] |
| 双链 | [[01_动态标签演示|动态标签]] | [ ] |

验收：单击单元格可修改；表格工具栏可增行/增列；单元格勾选框可回写当前表格。

## 4. 代码、Mermaid 与数学

```python
print("fenced code stays literal: #not-a-body-tag and $not_math$")
```

```mermaid
flowchart LR
    Source[Markdown 源文本] --> Parser --> Renderer --> Interaction[编辑回写]
```

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

Mermaid 当前从 CDN 加载，断网时应展示失败状态，不应导致页面崩溃。

## 5. 媒体

![图片](media/logo.jpg)

![完整视频](media/2026-06-14 07-16-30.mp4)

音频使用 `![audio](media/example.mp3)`；视频时间线片段使用 `@video[label](file.mp4?t=1.5,4.0)`。只有当对应文件真实存在时才能作为通过项。

## 6. 程序生成的 Markdown

下面的值来自 JSON，应走与普通页面相同的 MarkdownPreview：

{{script/render_showcase.json:markdown | run="render_showcase.py"}}

验收：标题、表格、勾选、WikiLink、`<kbd>`、数学、Mermaid 和完整视频均应渲染。修改生成区域后应回写 `script/render_showcase.json`，并暂停自动刷新，直到手动点击重跑。
