/**
 * Browser half: one keyed tool view for `render_ui`.
 *
 * The block is a pure function of the tool call's own arguments, which the
 * session log already carries — so refresh, replay and fork redraw it with no
 * store, no server round trip, and no DOM surgery on the chat's markdown. A
 * call whose arguments have not finished streaming draws a quiet placeholder
 * instead of flashing an error at a half-written JSON string.
 */

import React from 'react';
import { formatDiagnostics, parseProgram } from '../parse.js';
import { BlockFailure, BlockView } from './components.jsx';
import { CSS, STYLE_ID } from './styles.js';
import { OpenUiTail } from './tail.jsx';

/**
 * The call's arguments as an object, or null while they are still arriving.
 * A running call carries `argsRaw`; a settled result carries the same string on
 * its backfilled call head.
 * @param {any} block
 * @returns {Record<string, unknown> | null}
 */
function readArgs(block) {
  const raw = block?.kind === 'tool-result' ? block.call?.argsRaw : block?.argsRaw;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const value = JSON.parse(raw);
    return value !== null && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

/**
 * @param {{ block: any }} props
 */
export function RenderUi({ block }) {
  const args = readArgs(block);
  if (args === null) {
    return (
      <div className="ocb-root">
        <div className="ocb-skeleton"><span /><span /><span /></div>
      </div>
    );
  }
  const program = typeof args.program === 'string' ? args.program : '';
  const parsed = parseProgram(program);
  if (!parsed.ok || parsed.tree === null) {
    return <BlockFailure diagnostics={parsed.diagnostics} program={program} />;
  }
  return <BlockView tree={parsed.tree} title={typeof args.title === 'string' ? args.title : undefined} />;
}

/** Install the stylesheet once, however many times the plugin materializes. */
function installStyle() {
  if (typeof document === 'undefined') return () => {};
  const existing = document.getElementById(STYLE_ID);
  if (existing !== null) return () => {};
  const tag = document.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
  return () => {
    tag.remove();
  };
}

/** Client plugin identity — the loader reads `name`, `inject` and `apply` off the module. */
export const name = 'openui-blocks-client';
export const inject = ['slots'];

/**
 * Register the tool view for `render_ui`.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.effect(() => installStyle(), 'openui-blocks: stylesheet');
  // The block is drawn under the answer, outside the turn's folded process
  // group: the same turn-tail surface deliverables and action cards use.
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register(
    { name: 'conversation.chat.turnTail', id: '@fstack/dsh-openui-blocks' },
    OpenUiTail,
  ));
  // Kept as the expanded-Activity view of the call that produced the block.
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: 'render_ui' },
    RenderUi,
  ));
}

export { formatDiagnostics };
