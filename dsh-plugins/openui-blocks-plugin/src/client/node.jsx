/**
 * The block as a first-class chat row.
 *
 * A tool call renders inside the turn's folded Activity group, so a block drawn
 * there is invisible until the reader expands an accordion that never mentioned
 * a picture. This Definition claims the durable `openui/block` event the host
 * tool appends and publishes one Chat node per event, in flow order, next to
 * the prose that explains it.
 *
 * The event is log-only: it is not a surface event, so it never reaches the
 * model's prompt, and it replays like any other session event — the block
 * survives reload, fork and export without a store of its own.
 */

import React from 'react';
import { parseProgram } from '../parse.js';
import { BlockFailure, BlockView } from './components.jsx';

/**
 * One event → one node. `match` runs on every session event; `start` captures
 * the two facts the renderer needs; `buildViewNode` publishes the node at the
 * event's own seq so the chat orders it where the call happened.
 */
export const openUiBlockDefinition = {
  kind: 'openui-block',
  target: 'chat',
  match: (event) => (event.type === 'openui/block'
    ? { id: String(event.seq), role: 'start' }
    : null),
  start: (_context, match) => ({
    seq: match.event.seq,
    time: match.event.time,
    program: typeof match.event.data?.program === 'string' ? match.event.data.program : '',
    title: typeof match.event.data?.title === 'string' ? match.event.data.title : undefined,
  }),
  update: (context) => context.state,
  buildViewNode: (context) => {
    const state = context.state;
    if (state === undefined || state.program === '') return null;
    return {
      key: context.key,
      kind: 'openui-block',
      id: context.id,
      target: 'chat',
      anchorSeq: state.seq,
      location: context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' },
      visibility: 'visible',
      data: {
        kind: 'openui-block',
        seq: state.seq,
        time: state.time,
        program: state.program,
        title: state.title,
      },
    };
  },
};

/**
 * The row itself: a resolved block, or the reasons it could not be drawn.
 * @param {{ node: { data: { program: string, title?: string } } }} props
 */
export function OpenUiBlockNode({ node }) {
  const parsed = parseProgram(node.data.program);
  if (!parsed.ok || parsed.tree === null) {
    return <BlockFailure diagnostics={parsed.diagnostics} program={node.data.program} />;
  }
  return <BlockView tree={parsed.tree} title={node.data.title} />;
}
