/**
 * The text an agent reads about this tool. Every session pays for it once, so
 * it says each thing once: the rules that are not derivable from a signature
 * live in the paragraph, and each component's signature carries only the one
 * clause a model gets wrong without it.
 */

import { COMPONENTS, guidanceLine } from './catalog.js';

/** One valid block, shown so the model copies the shape rather than inventing one. */
export const EXAMPLE = [
  'root = Stack([head, note, top])',
  'head = Row([s1, s2])',
  's1 = Stat("Revenue", "¥412k", "+12.4%")',
  's2 = Stat("Orders", 1284, "+3.1%", "success")',
  'note = Callout("Refunds are excluded from both figures.", "info")',
  'top = BarChart(["Q1", "Q2", "Q3", "Q4"], [q], "k", true)',
  'q = Series("Revenue", [98, 104, 96, 114])',
].join('\n');

/**
 * The system-prompt section for `render_ui`.
 * @returns {string}
 */
export function buildGuidance() {
  const components = Object.keys(COMPONENTS).map(guidanceLine).join('\n');
  return [
    'UI blocks (`render_ui`): draw the answer as the harness\'s own interface — numbers, a table, a ranking, a flow, a note — instead of a paragraph that describes them.',
    'Call it when the answer is data or a structure the reader would otherwise picture in their head. Not for a few numbers, one short list, a greeting, code, or when plain text is asked for. Keep your prose: it says what the block means; the block is the artifact. One block per call, several per turn are fine.',
    '',
    'Language: one statement per line; the first is `root = Stack([...])`. Arguments are positional in signature order, optional ones droppable from the end only; `name: value` is not supported. Strings use double quotes, arrays `[...]`, objects `{key: value}`. Every name is defined on its own line and must be reachable from root. No state, no expressions, no functions.',
    '',
    'Components:',
    components,
    '',
    'Example:',
    EXAMPLE,
  ].join('\n');
}
