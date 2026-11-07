/**
 * The block, drawn under the answer.
 *
 * A tool call renders inside the turn's folded process group, so a block drawn
 * there is invisible until the reader expands an accordion that never mentioned
 * a picture. The turn tail is the surface DSH already uses for content that
 * belongs to a finished answer (deliverables, action cards): it renders after
 * the closing Assistant, outside the fold.
 *
 * The host folds each `render_ui` call into the `openuiBlocks` session
 * projection with the turn it landed in; this entry shows the blocks of its
 * own turn once that turn ended with an answer.
 */

import React from 'react';
import { parseProgram } from '../parse.js';
import { BlockFailure, BlockView } from './components.jsx';

/**
 * Blocks recorded for one turn, in the order the model emitted them.
 * @param {unknown} view
 * @param {number} turnNumber
 * @returns {Array<{ program: string, title?: string }>}
 */
function blocksOf(view, turnNumber) {
  const blocks = view !== null && typeof view === 'object' ? view.blocks : undefined;
  if (!Array.isArray(blocks)) return [];
  return blocks.filter(block => block !== null && typeof block === 'object'
    && block.turn === turnNumber
    && typeof block.program === 'string');
}

/**
 * Whether this turn ended with a final answer — the same gate the action cards
 * use, so a block never floats under a turn that produced no prose.
 * @param {any} turn
 * @returns {boolean}
 */
function answered(turn) {
  try {
    return turn?.end !== undefined && turn.data?.get?.('turn-tail')?.closing != null;
  } catch {
    return false;
  }
}

/**
 * @param {{ turn: { turn: number, end?: unknown, data?: any }, useProjection: (key: string) => unknown }} props
 */
export function OpenUiTail({ turn, useProjection }) {
  // The hook runs before any early return: this entry mounts on an open turn
  // (nothing to draw yet) and re-renders once the turn closes, so calling it
  // conditionally would change the hook count between renders.
  const view = useProjection('openuiBlocks');
  if (!answered(turn)) return null;
  const blocks = blocksOf(view, turn.turn);
  if (blocks.length === 0) return null;
  return (
    <div className="ocb-tail">
      {blocks.map((block, index) => {
        const parsed = parseProgram(block.program);
        return parsed.ok && parsed.tree !== null
          ? <BlockView key={index} tree={parsed.tree} title={block.title} />
          : <BlockFailure key={index} diagnostics={parsed.diagnostics} program={block.program} />;
      })}
    </div>
  );
}
