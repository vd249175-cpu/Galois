---
name: dnote-tags
description: Development guide for DNOTE tag indexing syntax, covering static inline tags, regular expression matches, and python script-based dynamic tags resolver covenants.
---

# DNOTE Tags Specification & Indexing Rules (`dnote-tags`)

本文档定义 DNOTE 笔记项目中标签的书写格式、索引与解析机制，以及动态脚本标签的开发规范。

---

## 1. YAML Frontmatter 标签声明

DNOTE 的标签系统基于 Markdown 文件头部的 YAML Frontmatter（`---` 块）。
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

直接写在 `tags:` 列表中的纯文本标签：

- **格式**：任意字符串（支持中文、emoji 等 Unicode）
- **索引时机**：文件保存后由 `tagResolver.ts` 同步解析
- **匹配行为**：在搜索中通过子字符串或精确匹配

```yaml
tags:
  - dog
  - 聪明
  - DNOTE
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
- **执行方式**：`uv run {scriptName}` 在项目 `script/` 目录中执行
- **迭代轮数**：由 `maxIterations` 配置控制（可在 Settings 中调节，默认 1 轮）

```yaml
tags:
  - run:tag_calculator.py         # 调用 script/tag_calculator.py 计算动态标签
  - run:collect_all_tags.py       # 从项目其他文件收集并归并标签
```

### 4.1 脚本环境变量

脚本执行时由 `tagResolver.ts` 注入以下环境变量（注意：与项目指令脚本的环境变量**不同**）：

| 变量名 | 说明 |
|--------|------|
| `DNOTE_NOTE_PATH` | 当前正在处理的笔记文件绝对路径 |
| `DNOTE_OUTPUT_FILE` | 脚本必须将 JSON 数组写入的目标路径 |
| `DNOTE_RESOLVED_TAGS` | 当前轮次已解析的标签列表（JSON 字符串，用于多轮迭代） |

> ⚠️ **注意**：标签脚本的环境变量是 `DNOTE_NOTE_PATH`（非 `DNOTE_ACTIVE_FILE`），
> 且**不会**注入 `DNOTE_PROJECT_PATH`，需要从 `DNOTE_NOTE_PATH` 推导。

### 4.2 脚本输出协议

标签脚本必须将结果**写入 `DNOTE_OUTPUT_FILE`**，内容为以下两种格式之一：

**方式 A：直接返回 tag 字符串数组（推荐）**
```json
["tag1", "tag2", "tag3"]
```

**方式 B：包含 `data.tags` 的结构化 JSON**
```json
{
  "status": "success",
  "data": { "tags": ["tag1", "tag2", "tag3"] },
  "timestamp": 1782305164
}
```

脚本同时应将标签数组 `print()` 到 stdout，以便调试。

### 4.3 脚本示例（`script/tag_calculator.py`）

```python
# /// script
# requires-python = ">=3.11"
# ///
import os, json

note_path   = os.environ.get('DNOTE_NOTE_PATH', '')
output_file = os.environ.get('DNOTE_OUTPUT_FILE', 'output.json')

# 推导项目根目录
project_path = os.environ.get('DNOTE_PROJECT_PATH') or os.path.dirname(note_path)

# 读取当前已解析标签（本轮迭代的输入）
resolved_json = os.environ.get('DNOTE_RESOLVED_TAGS', '[]')
current_tags = set(json.loads(resolved_json))

# 计算新标签（示例：根据现有标签推断父标签）
new_tags = list(current_tags)
if 'dog' in current_tags:
    new_tags.append('animal')

# 写入结果
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(new_tags, f, ensure_ascii=False)

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
                 └──> uv run {scriptName}（env: DNOTE_NOTE_PATH + DNOTE_OUTPUT_FILE + DNOTE_RESOLVED_TAGS）
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

除标签外，DNOTE 还支持在 Frontmatter 中声明每个笔记的显示图标：

```yaml
---
icon: 🐶
tags:
  - dog
---
```

图标由 `parseFrontmatterIcon` 解析，存储在 `system.icons` Blood 状态中，
由 `updateYamlFrontmatterIcon` 工具函数读写（用于文件浏览器的图标选择器）。
