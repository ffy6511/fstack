# Obsidian

这些 skill 约定 vault 里的笔记怎么写：语法、地图、论文、学习材料和公开同步。没有这个约定时，agent 会自己选格式，前后对不上。

| Skill | 用途 |
| --- | --- |
| [`obsidian-markdown`](obsidian-markdown/SKILL.md) | wikilink、embed、callout、properties 等 Obsidian 语法 |
| [`obsidian-vault`](obsidian-vault/SKILL.md) | domain map、roadmap canvas、导航结构 |
| [`obsidian-format-validation`](obsidian-format-validation/SKILL.md) | 校验 heading-fragment / block-ID wikilink |
| [`learning-unit-ingest`](learning-unit-ingest/SKILL.md) | 公开页 / YouTube / Bilibili → `learning/` 单元与地图 |
| [`paper-md-ingest`](paper-md-ingest/SKILL.md) | 论文 → `papers/`（含图表抽取） |
| [`knowledge-radar-actions`](knowledge-radar-actions/SKILL.md) | 雷达 digest 勾选后的 deep-read、论文、学习单元 |
| [`obsidian-public-sync`](obsidian-public-sync/SKILL.md) | 私库笔记同步到公开 Quartz，保留路径和 wikilink 依赖 |

定时出日报的提示在 [`automations/obsidian`](../../automations/obsidian/README.md)。勾选之后的深读、论文和学习单元用 `knowledge-radar-actions`。
