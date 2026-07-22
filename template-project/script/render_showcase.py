# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

import json
import os
from pathlib import Path


GENERATED_MARKDOWN = r"""### 程序生成的 Markdown

这个区域由 `script/render_showcase.py` 生成，但使用与普通页面相同的渲染和编辑逻辑。

- [ ] 顶层勾选项
  - [ ] 嵌套勾选项
- [x] 已完成项

| 功能 | 交互内容 | 状态 |
| :--- | :--- | :---: |
| 快捷键 | <kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd> | [ ] |
| WikiLink | [[00_新手指引|打开新手指引]] | [x] |
| 数学 | $E = mc^2$ | [ ] |

$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$

```mermaid
flowchart LR
    Script --> JSON --> Markdown --> InteractiveUI
```

![完整视频](media/2026-06-14 07-16-30.mp4)
"""


def main():
    output_value = os.environ.get("DNOTE_OUTPUT_FILE", "")
    if not output_value:
        raise SystemExit("DNOTE_OUTPUT_FILE is required")

    output_file = Path(output_value)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "status": "ready",
        "markdown": GENERATED_MARKDOWN,
    }
    output_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
