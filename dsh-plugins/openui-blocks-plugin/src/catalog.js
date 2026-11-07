/**
 * The component catalog for UI blocks — the one source for the parser's checks,
 * the renderer's props, and the text the model reads. A block may only use what
 * is listed here; everything else is a diagnostic naming the closest match.
 *
 * Deliberately small. Every component costs a line in the guidance every
 * session pays for, and a component that draws badly costs more than a missing
 * one: this first set is the read-only half of a chat answer (numbers, a table,
 * a ranking, a flow, a note). Inputs and buttons arrive with the answer channel.
 */

/** Tone names shared by Callout, Stat and Badge-like surfaces. */
export const TONES = ['neutral', 'info', 'success', 'warning', 'error'];

/** Step statuses, in flow order. */
export const STEP_STATUSES = ['done', 'current', 'todo', 'blocked'];

/** Step flow axes. */
export const DIRECTIONS = ['row', 'column'];

/**
 * @typedef {'text'|'number'|'value'|'tone'|'bool'|'direction'|'textList'|'numberList'
 *   |'tableRows'|'children'|'seriesList'|'stepItems'} ParamKind
 */

/**
 * @typedef {object} Param
 * @property {string} name
 * @property {ParamKind} kind
 * @property {boolean} [required] Absent means the argument is optional and may
 *   only be dropped from the END of the argument list (positional calls).
 * @property {string} [note] One clause printed after the signature, only where
 *   the signature alone leaves the model guessing.
 */

/**
 * @typedef {object} ComponentSpec
 * @property {string} summary
 * @property {Param[]} params
 * @property {boolean} [nested] True for a component that is only an argument of
 *   another one (Series); it can never sit in a Stack.
 */

/** @type {Record<string, ComponentSpec>} */
export const COMPONENTS = {
  Stack: {
    summary: 'vertical stack — the root of every block',
    params: [{ name: 'children', kind: 'children', required: true }],
  },
  Row: {
    summary: 'equal columns, wrapping on narrow widths',
    params: [{ name: 'children', kind: 'children', required: true }],
  },
  Text: {
    summary: 'a paragraph; **bold** and `code` are the inline markup',
    params: [{ name: 'text', kind: 'text', required: true }],
  },
  Callout: {
    summary: 'a note, warning or error',
    params: [
      { name: 'text', kind: 'text', required: true },
      { name: 'tone', kind: 'tone' },
      { name: 'title', kind: 'text' },
    ],
    note: 'only warning and error get a tinted box; info/success/neutral are an icon and text',
  },
  Stat: {
    summary: 'one number with its label and change',
    params: [
      { name: 'label', kind: 'text', required: true },
      { name: 'value', kind: 'value', required: true },
      { name: 'delta', kind: 'text' },
      { name: 'tone', kind: 'tone' },
    ],
    note: 'delta is written with its sign ("+12.4%") and the sign picks the arrow and colour',
  },
  Table: {
    summary: 'a table; numbers right-align by column',
    params: [
      { name: 'columns', kind: 'textList', required: true },
      { name: 'rows', kind: 'tableRows', required: true },
    ],
    note: 'every row has exactly as many cells as there are columns',
  },
  BarChart: {
    summary: 'ranked bars; one series ranks a list, several series compare',
    params: [
      { name: 'labels', kind: 'textList', required: true },
      { name: 'series', kind: 'seriesList', required: true },
      { name: 'unit', kind: 'text' },
      { name: 'whole', kind: 'bool' },
    ],
    note: 'unit follows each number ("98k", "42%"); whole=true adds the total, the largest and each share',
  },
  Series: {
    summary: 'the values of one series',
    params: [
      { name: 'name', kind: 'text', required: true },
      { name: 'values', kind: 'numberList', required: true },
    ],
    nested: true,
    note: 'null is a missing point: the bar is left out',
  },
  Steps: {
    summary: 'an ordered flow of steps',
    params: [
      { name: 'items', kind: 'stepItems', required: true },
      { name: 'direction', kind: 'direction' },
    ],
    note: 'an item is {title, status?, markdown?}; status is done | current | todo | blocked',
  },
};

/** Component names that may never stand in for a Stack child. */
export const NESTED_ONLY = new Set(
  Object.entries(COMPONENTS).filter(([, spec]) => spec.nested === true).map(([name]) => name),
);

/**
 * Render one component's signature for the guidance, e.g.
 * `Stat(label, value, delta?, tone?)`.
 * @param {string} name
 * @returns {string}
 */
export function signatureOf(name) {
  const params = COMPONENTS[name].params.map(p => (p.required === true ? p.name : `${p.name}?`));
  return `${name}(${params.join(', ')})`;
}

/**
 * Render a signature plus the one clause a model is likely to get wrong.
 * @param {string} name
 * @returns {string}
 */
export function guidanceLine(name) {
  const spec = COMPONENTS[name];
  return spec.note === undefined
    ? `${signatureOf(name)}: ${spec.summary}`
    : `${signatureOf(name)}: ${spec.summary} — ${spec.note}`;
}

/**
 * Names a typo is most likely to be: case-insensitive, shared prefix, short edit
 * distance. Used to make "unknown component" diagnostics actionable.
 * @param {string} name
 * @returns {string | undefined}
 */
export function closestComponent(name) {
  const lower = name.toLowerCase();
  const names = Object.keys(COMPONENTS);
  const exact = names.find(n => n.toLowerCase() === lower);
  if (exact !== undefined) return exact;
  const prefixed = names.find(n => n.toLowerCase().startsWith(lower) || lower.startsWith(n.toLowerCase()));
  if (prefixed !== undefined) return prefixed;
  // A typo keeps the first letter; without that rule "Chat" would be offered
  // "Stat", which sends the model to the wrong component.
  return names.find(n => n[0].toLowerCase() === lower[0] && distance(n.toLowerCase(), lower) <= 2);
}

/**
 * Levenshtein distance, capped by the caller's threshold.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function distance(a, b) {
  if (Math.abs(a.length - b.length) > 3) return Number.MAX_SAFE_INTEGER;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + cost);
      previous = saved;
    }
  }
  return row[b.length];
}
