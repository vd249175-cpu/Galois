---
name: dnote-tags
description: "Use when assisting with or building Galois note tags: frontmatter tags, body #hashtags, regex re: tags, run: dynamic tag scripts, file icons, tag search, and tag resolver behavior."
---

# Galois Tags Specification & Indexing Rules (`dnote-tags`)

本文档定义 Galois 笔记项目中标签的书写格式、索引与解析机制，以及动态脚本标签的开发规范。

## 0. 模式边界

**Assist Mode**：用户要给当前笔记加标签、解释标签、整理标签、用正文 `#标签` 标注内容、设计搜索语句、新增标签计算脚本、正则标签规则或 `run:` 动态标签脚本时，先读取 `{projectPath}/.dnote_runtime.json`，再处理当前笔记项目。

**Build Mode**：只有当用户要修改 Galois 应用本身的标签解析流程、文件树标签展示、保存时自动同步 frontmatter、或图谱/搜索联动实现时，才修改 `APP/file-tree`、`APP/editor` 或相关 APP/CORE 代码。

不要把 APP 插件服务脚本当成笔记项目标签脚本。笔记项目标签脚本属于 `script/`，通过 `electronAPI.runProjectScript` 执行。

正文 `#标签` 会被解析为派生标签，但不会在保存或加载时自动复制进
Frontmatter。编辑器顶部标签栏只增删手动 YAML 标签；正文标签以“正文”来源显示，
必须在正文中修改。这样删除手动标签不会被同名正文标签立刻写回 YAML，也不会因
点击顶部关闭按钮而意外改写笔记正文。

---

## 1. YAML Frontmatter 标签声明

Galois 的标签系统基于 Markdown 文件头部的 YAML Frontmatter（`---` 块）。
所有标签在 `tags:` 字段下以列表形式声明：

```markdown
---
tags:
  - dog
  - 聪明
  - re:#(\w+)
  - run:tag_calculator.py
---

这是笔记正文...
```

---

## 2. 静态标签（Static Tags）

直接写在 `tags:` 列表中的纯文本标签是手动标签：

- **格式**：任意字符串（支持中文、emoji 等 Unicode）
- **索引时机**：文件保存后由 `tagResolver.ts` 同步解析
- **匹配行为**：在搜索中通过子字符串或精确匹配

正文 hashtag 与手动标签是两个来源；`resolveTagsSync` 会把二者合并到
`system.resolvedTags`，而 `system.staticTags` 只保留 Frontmatter 原始标签。

```yaml
tags:
  - dog
  - 聪明
  - Galois
  - 知识管理
```

---

## 3. 正则标签（Regex Tags）

以 `re:` 前缀声明的标签，用于从**笔记正文**中动态提取匹配内容作为标签：

- **格式**：`re:<正则表达式>` — 正则捕获组 `(...)` 的内容将作为动态标签值
- **解析时机**：由 `resolveTagsSync` 函数在文件保存时同步执行（客户端 JS，无需外部脚本）

```yaml
tags:
  - re:#(\w+)                     # 提取正文中所有 #word 格式的 hashtag
  - re:#([\w\u4e00-\u9fa5]+)      # 同时支持中文字符
  - re:\[\[([^\]]+)\]\]           # 提取正文中所有 [[WikiLink]] 链接目标
```

### 正则标签匹配规则

- 正则表达式对去除 Frontmatter 后的**正文内容**进行全局匹配（`/pattern/g`）
- 若正则含**捕获组**，提取第 1 捕获组的值作为标签
- 若无捕获组，将整个匹配字符串作为标签
- 所有提取的值拼入该文件的 `resolvedTags` 列表

---

## 4. 脚本标签（Script-Based Dynamic Tags）

以 `run:` 前缀声明的标签，用于调用外部 Python 脚本做复杂动态计算：

- **格式**：`run:<script_name>.py`（脚本位于 `{projectPath}/script/` 目录下）
- **执行方式**：通过 `electronAPI.runProjectScript` 在项目 `script/` 目录中执行，默认等价于 `uv run script/<scriptName>`
- **迭代轮数**：由 `maxIterations` 配置控制（可在 Settings 中调节，默认 1 轮）

```yaml
tags:
  - run:tag_calculator.py         # 调用 script/tag_calculator.py 计算动态标签
  - run:collect_all_tags.py       # 从项目其他文件收集并归并标签
```

### 4.1 脚本环境变量

脚本执行时通过 `runProjectScript` 注入项目基础环境，并由 `tagResolver.ts` 追加标签解析上下文：

| 变量名 | 说明 |
|--------|------|
| `DNOTE_PROJECT_PATH` | 当前笔记项目根目录绝对路径 |
| `DNOTE_NOTE_PATH` | 当前正在处理的笔记文件绝对路径 |
| `DNOTE_RESOLVED_TAGS` | 当前轮次全项目已解析标签 map（JSON 字符串，用于多轮迭代） |

> 注意：标签脚本的目标文件变量是 `DNOTE_NOTE_PATH`，不是 `DNOTE_ACTIVE_FILE`。标签解析器当前只读取 `stdout` 中的 JSON 作为标签结果；不要只写 `DNOTE_OUTPUT_FILE` 而不打印结果。

### 4.2 脚本输出协议

标签脚本必须将计算结果输出至 **`stdout`**（标准输出，通常使用 `print()`），内容为以下两种 JSON 格式之一：

**方式 A：直接输出 tag 字符串数组的 JSON 字符串（推荐）**
```json
["tag1", "tag2", "tag3"]
```

**方式 B：输出包含 `data.tags` 的结构化 JSON**
```json
{
  "status": "success",
  "data": { "tags": ["tag1", "tag2", "tag3"] },
  "timestamp": 1782305164
}
```

### 4.3 脚本示例（`script/tag_calculator.py`）

```python
# /// script
# requires-python = ">=3.11"
# ///
import os, json

note_path   = os.environ.get('DNOTE_NOTE_PATH', '')
project_path = os.environ.get('DNOTE_PROJECT_PATH') or os.path.dirname(note_path)

# 读取当前全项目已解析标签 map（本轮迭代的输入）
resolved_json = os.environ.get('DNOTE_RESOLVED_TAGS', '{}')
resolved_map = json.loads(resolved_json)
current_tags = set(resolved_map.get(note_path, []))

# 计算新标签（示例：根据现有标签推断父标签）
new_tags = list(current_tags)
if 'dog' in current_tags:
    new_tags.append('animal')

print(json.dumps(new_tags, ensure_ascii=False))
```

---

## 5. 标签解析流程（tagResolver.ts）

```
fileTree 器官检测到 projectPath 或 fileSaved 变化
  └──> 读取所有 .md 文件内容
       └──> 对每个文件：
            ├── parseFrontmatterTags() → 提取 tags: 列表
            ├── resolveTagsSync()      → 解析 re: 正则标签（同步，JS 端）
            └──> 对 run: 标签（迭代 maxIterations 轮）：
                 └──> runProjectScript(scriptName)（env: DNOTE_PROJECT_PATH + DNOTE_NOTE_PATH + DNOTE_RESOLVED_TAGS）
                      └──> 解析 stdout/output 的 tag 数组
                           └──> 合并进 resolvedTags
  └──> 写入 Blood: system.resolvedTags（完整 map）
                    system.staticTags（仅静态标签 map）
                    system.icons（文件图标 map）
```

---

## 6. maxIterations 配置

`maxIterations` 控制 `run:` 脚本标签的最大迭代次数，用于处理**继承式标签计算**（如标签的传递闭包）：

- **Blood 频道**：`system.maxIterations`
- **默认值**：`1`（只跑一轮）
- **修改方式**：在编辑器 TagToolbar 的迭代次数下拉框中选择（1–10）
- **作用**：每一轮将上一轮的结果通过 `DNOTE_RESOLVED_TAGS` 传给下一轮，脚本可据此做累积计算

---

## 7. 文件图标

除标签外，Galois 还支持在 Frontmatter 中声明每个笔记的显示图标：

```yaml
---
icon: 🐶
tags:
  - dog
---
```

图标由 `parseFrontmatterIcon` 解析，存储在 `system.icons` Blood 状态中，
由 `updateYamlFrontmatterIcon` 工具函数读写（用于文件浏览器的图标选择器）。
