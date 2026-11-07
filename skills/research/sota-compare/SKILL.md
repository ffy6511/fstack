---
name: sota-compare
description: >
  Compare state-of-the-art results on a task or benchmark. Answers 现在谁最强,
  SOTA 是多少, 这个任务有哪些 benchmark, and 这几个方法差多少. Uses only the
  Papers With Code catalog, because leaderboard rows carry scores, model sizes,
  paper links and dates that free-text sources do not. Not for reading a paper's
  method (use $paper-deep-read) and not for finding related work
  (use $paper-find).
---

# SOTA Compare

## Steps

1. Resolve the benchmark. Start from `pwc list_benchmarks` with a `task`; when
   the user named a benchmark outright, go to step 3.
2. Pick 1–3 benchmarks. More than three turns the answer into a data dump.
3. `pwc get_benchmark` with the benchmark name and whatever filters the user
   implied: `max_parameters`, `is_open`, `minimum_metrics`.
4. Read the top rows: model, score, parameter count, paper, publication date.
5. If the requested metric is missing, `get_benchmark` answers with
   `metric_note` listing the metrics that leaderboard actually reports. Re-query
   with one of those names instead of guessing.

## Output

A table with one row per model and one column per metric. Below it, three lines:

- Who leads, and by how much.
- Whether the gap is inside the spread the leaderboard itself shows.
- The date the data was read, because leaderboards go stale.

## Boundaries

- Quote scores from the leaderboard only. A number in an abstract is the
  authors' claim, not the catalog's record.
- Do not rank methods the leaderboard does not contain.
- Do not decide which method the user should adopt. Report the numbers and the
  trade-offs the table already exposes.
