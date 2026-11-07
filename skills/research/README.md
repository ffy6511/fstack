# 研究与论文

这些 skill 约定怎么找论文、怎么比 SOTA、怎么精读一篇。数据来自两个 MCP 服务：Papers With Code（匿名只读）和 alphaXiv（需要订阅，用来读全文和代码）。

| Skill | 用途 |
| --- | --- |
| [`paper-find`](paper-find/SKILL.md) | 给一个主题找候选论文。先用 PwC 目录筛，召回不够再让 alphaXiv 做语义检索，产出 5–10 篇带入选理由的清单。 |
| [`sota-compare`](sota-compare/SKILL.md) | 查某个任务或 benchmark 现在的 SOTA。只读榜单，出横向对比表，标注数据抓取日期。 |
| [`paper-deep-read`](paper-deep-read/SKILL.md) | 精读一篇。批量提问拿页级原文，读官方代码仓，产出带页码的结构化笔记。 |

三个 skill 各带一份 `preferences.example.toml`，字段一致：只写 MCP 服务名和密钥变量名，不写密钥。首次使用先 `cp preferences.example.toml preferences.toml`。

笔记落盘交给 [`obsidian/paper-md-ingest`](../obsidian/paper-md-ingest/SKILL.md)，这一组不写 `papers/`。
