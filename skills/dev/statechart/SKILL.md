---
name: statechart
description: >
  Make the state machine implicit in a feature explicit: name the states, the
  events that move between them, and the rules a reader agrees to, then draw
  the result as a Mermaid statechart and report the shortest path to every
  state that breaks a rule. Use when the user invokes /statechart or
  $statechart, when a bug must be shown as a path through states, or when one
  change needs a smaller review surface than reading the implementation.
  Manual only — do not auto-run on generic "explain the code" or "draw a
  diagram". Not for architecture diagrams or data-flow charts.
---

# Statechart

A chart exists to shrink what a reviewer must read. Instead of the
implementation, they check one drawing against the behavior they asked for.
The reader decides whether the behavior is right; the chart only makes it
legible.

Reference: Lauren Tan's `statechart` skill in
[cursor/plugins](https://github.com/cursor/plugins/tree/main/pstack/skills/statechart),
which compiles a TLA+ model and checks it with TLC. This skill keeps the
idea and the review posture, and drops the model checker by default — see
**Scope**.

## Scope

Default: no TLA+, no TLC, no Java. Draw and check by hand, and say so in the
hand-off. Model checking is opt-in; see the last section.

The chart is a review artifact, not proof. It narrows what must be read; it
does not certify the code.

## Workflow

1. **Name the states.** Use the reader's words for what is observable
   ("Paying", "Lease held, write pending"). Never use variable names,
   enum members, or internal flags. If a state is only an implementation
   detail, leave it out.
2. **Name the events.** One arrow is one thing that happens, written as the
   reader sees it happen ("you press play", "the connect fails"). Two events
   that end in the same place for the reader share one arrow.
3. **Write the rules as invariants.** One sentence per rule, in reader
   language: "an order never ships twice". If no state makes the rule
   checkable, add the state the reader would need — never weaken the rule to
   fit the current model.
4. **Draw it.** `stateDiagram-v2`, at most about 20 arrows. Use parent states
   for phases, and name terminal states explicitly. Put conditions in
   brackets in the reader's words: `you press play [while the file loads]`.
5. **Check it by hand.** Look for:
   - unreachable states — no path from a start state
   - dead ends — a state with no exit that is not declared terminal
   - rule breaks — a reachable state that violates an invariant
   - loops that never leave — a cycle with no exit that the reader would
     consider stuck
6. **Report.** For each rule break, the shortest path from a start state, one
   step per event.
7. **Replay against the code.** Every reported path must be reproduced against
   the real code, as a test or a live repro, one step per repeated action. If
   it does not reproduce, treat the model as wrong until you show it is not.

## Handing off

- The Mermaid block, and the sentence each rule comes from.
- One line per bug: the rule, the reader's sentence, and the numbered path.
- What the model leaves out — deferred features, external systems, timing,
  anything the reader agreed to ignore.
- Whether it was model-checked. Default: **no**.

## Guardrails

- Do not edit code while building the chart. Running the code or its tests to
  replay a path is part of the work.
- Do not invent rules the reader did not agree to. Ask once, then use their
  wording.
- Do not merge two states that break different rules; the reader then cannot
  see which rule breaks where.
- Keep every state of a reported bug path, even when it makes the chart
  busier.
- Match the reader's language in labels, rules, and the hand-off.

## Opt-in: model checking

Only when the state space is too large to check by hand, or the user asks.
Write a TLA+ spec with the same states and events, run TLC, and keep the
chart and the spec from one set of variables. mise installs Java and TLC on
first run and needs network. Treat spec drift as real: the spec is not the
code, and every reported break still gets replayed against the code.
