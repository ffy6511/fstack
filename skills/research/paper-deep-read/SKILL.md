---
name: paper-deep-read
description: >
  Read one paper closely and produce a structured note with page-level
  citations: method, data, evaluation setup, results and author-stated
  limitations. Uses alphaXiv answer_pdf_queries for page-filtered text,
  read_files_from_github_repository for the official implementation, and
  get_paper_notes for the user's own highlights. Use when the user says
  精读这篇, 它怎么实现的, 作者用了什么数据集, or needs quotable evidence.
  Not for finding papers (use $paper-find) and not for comparing leaderboards
  (use $sota-compare).
---

# Paper Deep Read

## Before reading

Call `alphaxiv get_paper_notes` first. The user may already have highlighted the
parts they care about, which changes what is worth extracting.

## Steps

1. `alphaxiv answer_pdf_queries` once, with every question batched:
   `["method steps", "training data", "evaluation setup", "limitations"]`.
   One call per paper. Asking a second question separately costs the same quota
   as adding it to the first call.
2. Call again only when a claim needs an exact number, and make the query
   narrower than the first pass.
3. For implementation claims, `read_files_from_github_repository` with path `/`
   to get the tree, then read the one or two files that matter. Do not pull a
   whole repository into context.
4. `get_paper_content` with `fullText: false` returns the AI intermediate
   report. Use it to orient, never as the citation source.

## Output

Five sections. Every line carries a page number or a file path:

- Method
- Data
- Evaluation setup
- Results
- Limitations

Quote original wording for anything load-bearing; paraphrase the rest. Keep your
own doubts in a separate line marked as yours, not as the authors'.

## Boundaries

- Do not invent page numbers. When the returned XML has no page text for a
  claim, say the claim came from the abstract.
- Do not merge author-stated limitations with your own critique.
- Hand the finished note to `$paper-md-ingest` for `papers/`. Do not build the
  vault layout yourself.
