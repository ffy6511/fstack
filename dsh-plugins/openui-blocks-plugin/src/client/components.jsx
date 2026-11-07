/**
 * The drawing half of UI blocks: a resolved openui-lang tree in, harness-native
 * React out.
 *
 * Nothing here chooses a palette or a spacing that the harness does not already
 * have — colours are alias tokens (see styles.js), type comes from the font
 * scale, and the few shapes that are decisions rather than tokens are the ones
 * a chat answer needs: a stat tile that reads as one number, a table whose
 * numbers line up, a ranking rather than a plot when there is one series, and
 * steps whose connector says how far the work got.
 */

import React from 'react';

/* ------------------------------------------------------------------ icons */

/**
 * @param {{ path: React.ReactNode, size?: number, className?: string }} props
 */
function Icon({ path, size = 14, className }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path}
    </svg>
  );
}

const iconPath = {
  check: <path d="M3.4 8.5 6.3 11.3 12.6 4.9" />,
  alert: <><path d="M8 2.6 14 13H2L8 2.6Z" /><path d="M8 6.6v3" /><path d="M8 11.3h.01" /></>,
  info: <><circle cx="8" cy="8" r="5.9" /><path d="M8 7.3v3.4" /><path d="M8 5.1h.01" /></>,
  error: <><circle cx="8" cy="8" r="5.9" /><path d="M5.9 5.9l4.2 4.2M10.1 5.9l-4.2 4.2" /></>,
  dot: <circle cx="8" cy="8" r="3" fill="currentColor" stroke="none" />,
  up: <><path d="M8 12.6V3.6" /><path d="M4.4 7.2 8 3.6l3.6 3.6" /></>,
  down: <><path d="M8 3.4v9" /><path d="M4.4 8.8 8 12.4l3.6-3.6" /></>,
};

/* ---------------------------------------------------------------- values */

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

/**
 * A number the way a chart label wants it: compact above ten thousand, exact
 * below it, and never a float artifact.
 * @param {number} value
 * @returns {string}
 */
export function formatNumber(value) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${trimZero(value / 1e9)}B`;
  if (abs >= 1e6) return `${trimZero(value / 1e6)}M`;
  if (abs >= 1e5) return `${trimZero(value / 1e3)}k`;
  return numberFormat.format(value);
}

/**
 * @param {number} n
 * @returns {string}
 */
function trimZero(n) {
  return Number(n.toFixed(n >= 100 ? 0 : 1)).toString();
}

/**
 * A value with its unit: a percent hugs the number, a word does not.
 * @param {number} value
 * @param {string} [unit]
 * @returns {string}
 */
export function formatValue(value, unit) {
  const literal = typeof value === 'number' ? formatNumber(value) : String(value);
  if (unit === undefined || unit === '') return literal;
  return /^[%‰°]$/.test(unit) ? `${literal}${unit}` : `${literal} ${unit}`;
}

/**
 * The sign of a delta string, for its arrow and its default tone. A delta is
 * written the way a person writes it ("+12.4%", "-3 pt", "持平").
 * @param {string | undefined} delta
 * @returns {'up' | 'down' | 'flat'}
 */
function deltaDirection(delta) {
  if (typeof delta !== 'string') return 'flat';
  const trimmed = delta.trim();
  if (/^[-−]/.test(trimmed)) return 'down';
  if (/^\+/.test(trimmed)) return 'up';
  return 'flat';
}

/* --------------------------------------------------------------- inline */

/**
 * Inline markup a Text or Callout may carry: **bold** and `code`. Everything
 * else stays literal — a block never becomes a second markdown pipeline.
 * @param {string} text
 * @returns {React.ReactNode[]}
 */
export function inline(text) {
  const source = String(text);
  const nodes = [];
  const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;
  let last = 0;
  let match;
  let key = 0;
  while ((match = pattern.exec(source)) !== null) {
    if (match.index > last) nodes.push(source.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) nodes.push(<strong key={`b${key++}`}>{token.slice(2, -2)}</strong>);
    else nodes.push(<code key={`c${key++}`}>{token.slice(1, -1)}</code>);
    last = match.index + token.length;
  }
  if (last < source.length) nodes.push(source.slice(last));
  return nodes;
}

/* ------------------------------------------------------------ components */

/**
 * @param {{ node: any }} props
 */
function Children({ node }) {
  const children = node.args[0];
  return <>{children.map((child, i) => <Node key={i} node={child} />)}</>;
}

/**
 * A Stack groups consecutive stats into one grid: three Stats written as three
 * statements are one row of numbers, not three cards with nothing between them.
 * @param {{ node: any }} props
 */
function Stack({ node }) {
  /** @type {any[]} */
  const children = node.args[0];
  /** @type {Array<{ kind: 'stats', items: any[] } | { kind: 'node', node: any }>} */
  const groups = [];
  for (const child of children) {
    const last = groups[groups.length - 1];
    if (child.name === 'Stat') {
      if (last !== undefined && last.kind === 'stats') last.items.push(child);
      else groups.push({ kind: 'stats', items: [child] });
      continue;
    }
    groups.push({ kind: 'node', node: child });
  }
  return (
    <div className="ocb-stack">
      {groups.map((group, i) => group.kind === 'stats'
        ? (
          <div className="ocb-stats" key={`s${i}`}>
            {group.items.map((stat, j) => <Stat key={j} node={stat} />)}
          </div>
        )
        : <Node key={`n${i}`} node={group.node} />)}
    </div>
  );
}

/**
 * @param {{ node: any }} props
 */
function Row({ node }) {
  return (
    <div className="ocb-row">
      {node.args[0].map((child, i) => <Node key={i} node={child} />)}
    </div>
  );
}

/**
 * @param {{ node: any }} props
 */
function Text({ node }) {
  return <p className="ocb-text">{inline(node.args[0])}</p>;
}

/**
 * Only a warning or an error earns a tinted box; a note or a success is an
 * icon and text, because five tinted boxes in one answer read as stripes.
 * @param {{ node: any }} props
 */
function Callout({ node }) {
  const [text, tone = 'neutral', title] = node.args;
  const boxed = tone === 'warning' || tone === 'error';
  const glyph = tone === 'warning' ? iconPath.alert : tone === 'error' ? iconPath.error : tone === 'success' ? iconPath.check : iconPath.info;
  return (
    <div className="ocb-callout" data-tone={tone} data-boxed={boxed ? 'true' : 'false'}>
      <span className="ocb-callout-icon"><Icon path={glyph} /></span>
      <div className="ocb-callout-body">
        {title !== undefined && <p className="ocb-callout-title">{title}</p>}
        <div className="ocb-text" style={{ margin: 0 }}>{inline(text)}</div>
      </div>
    </div>
  );
}

/**
 * @param {{ node: any }} props
 */
function Stat({ node }) {
  const [label, value, delta, tone] = node.args;
  const direction = deltaDirection(delta);
  // A written tone wins; otherwise the sign picks the colour, because "+12%"
  // is good news unless the author says it is not (latency, error rate).
  const resolvedTone = tone ?? (direction === 'up' ? 'success' : direction === 'down' ? 'error' : 'neutral');
  return (
    <div className="ocb-stat">
      <div className="ocb-stat-label" title={label}>{label}</div>
      <div className="ocb-stat-value">{typeof value === 'number' ? formatNumber(value) : value}</div>
      {delta !== undefined && (
        <span className="ocb-delta" data-tone={resolvedTone}>
          {direction !== 'flat' && <Icon size={10} path={direction === 'up' ? iconPath.up : iconPath.down} />}
          {delta}
        </span>
      )}
    </div>
  );
}

/**
 * @param {{ node: any }} props
 */
function Table({ node }) {
  const [columns, rows] = node.args;
  // A column is right-aligned when every filled cell in it is a number — the
  // reading rule for tables of figures, decided per column rather than per cell.
  const numeric = columns.map((_, c) => rows.length > 0 && rows.every(row => typeof row[c] === 'number' || row[c] === ''));
  return (
    <div className="ocb-table-wrap">
      <table className="ocb-table">
        <thead>
          <tr>
            {columns.map((column, c) => (
              <th key={c} data-numeric={numeric[c] ? 'true' : 'false'}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} data-numeric={numeric[c] ? 'true' : 'false'}>
                  {typeof cell === 'number' ? formatNumber(cell) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Series colours: the four state aliases, then a tint between the first two. */
/** Fill strength by rank in a one-series ranking. */
const RANK_OPACITY = [1, 0.72, 0.55, 0.42];

const SERIES_COLORS = [
  'var(--ocb-accent)',
  'var(--ocb-success)',
  'var(--ocb-warn)',
  'var(--ocb-error)',
  'color-mix(in srgb, var(--ocb-accent) 55%, var(--ocb-success) 45%)',
];

/**
 * @param {{ node: any }} props
 */
function BarChart({ node }) {
  const [labels, series, unit, whole] = node.args;
  const multi = series.length > 1;

  if (!multi) {
    const values = series[0].args[1];
    const pairs = labels
      .map((label, i) => ({ label, value: values[i] }))
      .filter(pair => typeof pair.value === 'number');
    if (pairs.length === 0) return <p className="ocb-text">No values to draw.</p>;
    // One series is a ranking, not a plot: sorted, because the reader's
    // question is "which is biggest", and a plot is what LineChart is for.
    const ranked = [...pairs].sort((a, b) => b.value - a.value);
    const max = Math.max(...ranked.map(p => Math.abs(p.value))) || 1;
    const total = ranked.reduce((sum, p) => sum + p.value, 0);
    const average = total / ranked.length;
    const top = ranked[0];
    return (
      <div className="ocb-chart">
        <div className="ocb-chart-head">
          {whole === true && <span>Total <b>{formatValue(total, unit)}</b></span>}
          <span>Largest <b>{formatValue(top.value, unit)}</b></span>
          {whole !== true && <span>Average <b>{formatValue(average, unit)}</b></span>}
        </div>
        <div className="ocb-bars">
          {ranked.map((pair, i) => {
            const ratio = Math.abs(pair.value) / max;
            const share = total === 0 ? 0 : (pair.value / total) * 100;
            return (
              <div className="ocb-bar" key={`${pair.label}-${i}`}>
                <div className="ocb-bar-line">
                  <span className="ocb-bar-label" title={pair.label}>{pair.label}</span>
                  <span className="ocb-bar-value">
                    {formatValue(pair.value, unit)}
                    {whole === true && <span className="ocb-bar-share">{trimZero(share)}%</span>}
                  </span>
                </div>
                <div className="ocb-bar-track">
                  <span
                    className="ocb-bar-fill"
                    data-negative={pair.value < 0 ? 'true' : 'false'}
                    style={{
                      width: `${Math.max(1.5, ratio * 100)}%`,
                      // The ranking carries itself: the first bar is the accent,
                      // the rest step back, so the eye lands on the leader first.
                      opacity: RANK_OPACITY[i] ?? 0.34,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Several series compare at equal weight: every value keeps its label's place,
  // so a trend cannot be reordered by size.
  const max = Math.max(
    1,
    ...series.flatMap(s => s.args[1].filter(v => typeof v === 'number').map(v => Math.abs(v))),
  );
  return (
    <div className="ocb-chart">
      <div className="ocb-legend">
        {series.map((s, i) => (
          <span className="ocb-legend-item" key={i}>
            <span className="ocb-legend-dot" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
            {s.args[0]}
          </span>
        ))}
      </div>
      {labels.map((label, row) => (
        <div className="ocb-group" key={`${label}-${row}`}>
          <div className="ocb-group-name">{label}</div>
          {series.map((s, i) => {
            const value = s.args[1][row];
            if (typeof value !== 'number') return null;
            return (
              <div className="ocb-group-row" key={i}>
                <div className="ocb-bar-track">
                  <span
                    className="ocb-bar-fill"
                    style={{
                      width: `${Math.max(2, (Math.abs(value) / max) * 100)}%`,
                      background: SERIES_COLORS[i % SERIES_COLORS.length],
                      opacity: 0.82,
                    }}
                  />
                </div>
                <span className="ocb-bar-value">{formatValue(value, unit)}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * @param {{ node: any }} props
 */
function Steps({ node }) {
  const [items, direction = 'row'] = node.args;
  return (
    <div className="ocb-steps" data-direction={direction}>
      {items.map((item, i) => {
        const status = item.status ?? 'todo';
        const done = status === 'done';
        const glyph = status === 'done' ? iconPath.check : status === 'blocked' ? iconPath.error : null;
        return (
          <div className="ocb-step" key={i} data-status={status} data-done={done ? 'true' : 'false'}>
            <span className="ocb-step-mark">{glyph !== null && <Icon size={9} path={glyph} />}</span>
            <div className="ocb-step-body">
              <span className="ocb-step-title">{item.title}</span>
              {item.markdown !== undefined && <span className="ocb-step-note">{inline(item.markdown)}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * One resolved node to React. An unknown name cannot reach here — the parser
 * rejects it before a block is drawn — but a future component would land on the
 * neutral fallback rather than crash the turn.
 * @param {{ node: any }} props
 */
function Node({ node }) {
  switch (node.name) {
    case 'Stack': return <Stack node={node} />;
    case 'Row': return <Row node={node} />;
    case 'Text': return <Text node={node} />;
    case 'Callout': return <Callout node={node} />;
    case 'Stat': return <Stat node={node} />;
    case 'Table': return <Table node={node} />;
    case 'BarChart': return <BarChart node={node} />;
    case 'Steps': return <Steps node={node} />;
    default: return null;
  }
}

/**
 * A block that cannot be drawn: the parser's reasons and the folded source.
 * Nothing is half-drawn — a block that dropped an option silently would answer
 * a different question than the one the model wrote.
 * @param {{ diagnostics: Array<{line: number, message: string}>, program: string }} props
 */
export function BlockFailure({ diagnostics, program }) {
  return (
    <div className="ocb-root">
      <div className="ocb-fail">
        <div className="ocb-fail-title">
          <Icon size={13} path={iconPath.error} />
          This block was not drawn
        </div>
        <ul>
          {diagnostics.slice(0, 6).map((d, i) => (
            <li key={i}>line {d.line}: {d.message}</li>
          ))}
        </ul>
        <details>
          <summary>Program</summary>
          <pre>{program}</pre>
        </details>
      </div>
    </div>
  );
}

/**
 * A resolved block, with its optional heading.
 * @param {{ tree: any, title?: string }} props
 */
export function BlockView({ tree, title }) {
  return (
    <div className="ocb-root">
      {title !== undefined && title !== '' && <div className="ocb-eyebrow">{title}</div>}
      <div className="ocb-body"><Node node={tree} /></div>
    </div>
  );
}

export { Icon, iconPath };
