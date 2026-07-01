---
name: dnote-search
description: Search specifications for Galois workspaces, covering tag query tokenization, infix-to-postfix boolean logic evaluation, and note filtering patterns.
---

# Galois Search Specifications & Logic Evaluation (`dnote-search`)

本文档定义 Galois 文件浏览器（Lattice Explorer）中搜索框所支持的语法、查询分词规则，以及布尔逻辑匹配算法。

---

## 1. 搜索查询语法

搜索框支持文件名文本匹配和布尔标签表达式的**同时**评估：

### 1.1 匹配类型

| 类型 | 语法 | 说明 | 示例 |
|------|------|------|------|
| 文件名搜索 | 普通文本 | 大小写不敏感的文件名子字符串匹配 | `Movie` 匹配 `MovieNote.md` |
| 静态标签 | `#tagName` | 精确或子字符串匹配标签值 | `#todo` 匹配 frontmatter 中含 `todo` 的文件 |
| 正则标签（前缀） | `#re:pattern` | 将 pattern 编译为 RegExp 匹配标签 | `#re:^Can.*` 匹配以 Can 开头的标签 |
| 正则标签（斜杠） | `#/pattern/flags` | 带 flags 的 regex 标签匹配 | `#/dog/i` 大小写不敏感匹配含 dog 的标签 |

### 1.2 布尔操作符

| 操作符 | 别名 | 说明 |
|--------|------|------|
| AND | `and`、`&&`、`add`、空格分隔 | 交集：两个条件都满足 |
| OR | `or`、`\|\|` | 并集：任一条件满足 |
| NOT | `not`、`!` | 取反：排除满足该条件的文件 |
| 分组 | `(`、`)` | 自定义求值优先级 |

### 1.3 组合示例

```
拉布拉多 #dog && !#温顺      ← 文件名含"拉布拉多"且有 dog 标签但没有 温顺 标签
#todo or #urgent             ← 有 todo 或 urgent 标签
(#dog || #cat) && #聪明      ← 有 dog 或 cat 标签，且有聪明标签
#re:^20\d{2}                 ← 标签以 20xx 年份格式开头
#/中文/                      ← 标签包含中文（regex 匹配）
```

---

## 2. 查询分词 (`tokenizeQuery`)

Galois 使用以下正则表达式对查询字符串进行分词：

```
/(#re:\S+|re:\S+|\(|\)|#\/[^\/]+\/[a-z]*|#[^\s()#]+|and|add|or|not|&&|\|\||!|\S+)/gi
```

分词后每个 token 属于三种类型之一：

| 类型 | 说明 | 示例 |
|------|------|------|
| `tag` | 标签查询 token | `#ideas`、`#re:Canine`、`#/dog/i` |
| `operator` | 逻辑操作符（归一化为 `&`、`\|`、`!`、`(`、`)`） | `and` → `&`、`or` → `\|` |
| `filename` | 文件名匹配 token | `Movie`、`拉布拉多` |

---

## 3. 布尔逻辑求值 (`evaluateBoolean`)

Galois 使用**调度场算法（Shunting-Yard）**将中缀表达式转换为后缀（RPN）再求值，
支持任意嵌套的括号分组和多级优先级：

### 3.1 操作符优先级

| 操作符 | 优先级 |
|--------|--------|
| `!`（NOT） | 3（最高） |
| `&`（AND） | 2 |
| `\|`（OR） | 1（最低） |

### 3.2 求值流程

```
1. 中缀转后缀（Infix → Postfix）
   输入：  #dog && !#温顺
   输出队列：  [#dog, #温顺, !, &]

2. 后缀栈求值（RPN Stack Evaluation）
   读取 #dog → 检查文件标签 → 入栈 true/false
   读取 #温顺 → 检查文件标签 → 入栈 true/false
   读取 ! → 弹出栈顶取反 → 入栈
   读取 & → 弹出两个值做 AND → 入栈最终结果

3. 返回栈顶 boolean，决定该文件是否出现在搜索结果中
```

---

## 4. 标签匹配解析

### 4.1 静态标签匹配 (`checkSingleTagMatch`)

对于非正则的普通标签查询（如 `#dog`）：
- 将查询值与文件的所有已解析标签逐一进行**子字符串匹配**（大小写不敏感）
- `#dog` 可以匹配标签 `dog`、`doggy`、`HotDog`

### 4.2 正则标签匹配

对于 `#re:pattern` 或 `#/pattern/flags` 格式：
- 将 pattern 编译为 JavaScript `RegExp` 对象
- 对文件的每一个已解析标签调用 `.test(tag)`
- 任一标签匹配即视为该文件满足条件

### 4.3 标签来源

搜索时使用的标签来自 `system.resolvedTags` Blood 状态，这是由 `fileTree` 器官通过 `tagResolver.ts` 计算得到的完整标签 map：

```typescript
// system.resolvedTags 的结构：
{
  "/path/to/note1.md": ["dog", "聪明", "温顺"],
  "/path/to/note2.md": ["cat", "独立"],
  // ...
}
```

---

## 5. 文件名匹配

文件名 token 对笔记文件的 **basename**（不含路径和扩展名）进行大小写不敏感的子字符串匹配。

```
查询 "拉布" → 匹配 "拉布拉多.md"（basename: "拉布拉多"）
查询 "note" → 匹配 "MovieNote.md"（basename: "MovieNote"）
```

---

## 6. 标签自动补全

搜索框在用户输入 `#` 字符后，会弹出标签自动补全下拉菜单，
候选项来自 `system.staticTags` 中当前项目所有文件的已知标签集合。

---

## 7. 离线查询脚本

本 skill 的 `scripts/` 目录下提供了该查询解析器的 Python 实现，
可以直接从终端或 `run_command` 工具对笔记项目进行复杂布尔标签查询：

```bash
python3 scripts/query_engine.py --dir <project_dir> --query "#dog && !#温顺"
```
