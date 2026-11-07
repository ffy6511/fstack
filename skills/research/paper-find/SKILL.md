---
name: paper-find
description: >
  Shortlist research papers for a topic, a task, or a "what's the state of X"
  question. Query the Papers With Code catalog first for taxonomy and
  deterministic filters, then alphaXiv discover_papers only when semantic recall
  is needed. Use when the user asks for related work, a reading list, 找几篇综述,
  有哪些论文在做 X, or a survey starting point. Not for reading one paper in
  depth (use $paper-deep-read) and not for leaderboard comparison
  (use $sota-compare).
---

# Paper Find

## Setup

The `alphaxiv` server needs `ALPHAXIV_API_KEY` in the environment of whatever
process starts it. When a tool is missing or answers with an auth error, tell
the user to export that variable and restart the harness. Never ask them to
paste the key into the chat.

## Source order

| Situation | Call |
| --- | --- |
| Vague topic | `pwc` `search_papers`, `mode: "hybrid"`, `limit` ≤ 25 |
| Known task or benchmark | `pwc` `list_benchmarks`, then `list_papers` |
| PwC recall is too coarse | `alphaxiv` `discover_papers` |

Cost: alphaXiv `discover_papers`, `get_paper_content` and `answer_pdf_queries`
bill against the subscription quota. `get_for_you_feed`, `get_hot_feed` and
library calls do not. Filter with PwC first, then spend alphaXiv on the few
candidates that survive.

## Steps

1. Reduce the request to 2–4 keywords plus one sentence on what would count as a
   good paper.
2. `pwc search_papers`. Narrow with `published_after`,
   `has_official_implementation`, or a task/method filter when the user gave a
   boundary.
3. Keep 5–10 candidates. Drop anything whose title matches on words only.
4. If fewer than 5 survive, run one `alphaxiv discover_papers` call with the same
   keywords and `difficulty` 3–6.
5. Deduplicate by arXiv ID. PwC catalog IDs and alphaXiv universal IDs differ for
   the same paper, so compare arXiv ID or title, never the two ID spaces.

## Output

One table, 5–10 rows:

| arXiv ID | Title | Why it is here | Official code |
| --- | --- | --- | --- |

One line per paper is enough; the user picks what to read next.

## Boundaries

- Do not download or summarize full text here; that is `$paper-deep-read`.
- Do not call a paper state of the art; that is `$sota-compare`.
- Hand the ID list to `$paper-md-ingest` when the user wants it filed. Do not
  write into `papers/` yourself.
- If alphaXiv is unavailable, say the shortlist came from the PwC catalog alone.
