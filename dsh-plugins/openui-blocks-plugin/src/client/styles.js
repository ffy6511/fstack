/**
 * One stylesheet for every block, injected once by the client plugin.
 *
 * Only harness tokens are used, so a block inherits the active theme without
 * knowing which one it is: labels come from the alias label scale, surfaces and
 * hairlines from the layer/border aliases, and the accent, success, error and
 * warning tones from the state aliases. No hard-coded palette, no dark-mode
 * branch — a theme that changes those aliases changes the block.
 */
export const STYLE_ID = 'dsh-openui-blocks-style';

export const CSS = `
.ocb-tail { display: flex; flex-direction: column; gap: 14px; margin: 10px 0 2px; }
.ocb-root {
  --ocb-text-1: var(--dsw-alias-label-primary, #16181d);
  --ocb-text-2: var(--dsw-alias-label-secondary, #5b6270);
  --ocb-text-3: var(--dsw-alias-label-tertiary, #8a919e);
  --ocb-hairline: var(--dsw-alias-border-l2, rgba(125, 133, 148, 0.22));
  --ocb-layer: var(--dsw-alias-bg-layer-1, rgba(125, 133, 148, 0.06));
  --ocb-accent: var(--dsw-alias-state-business-primary, #4d6bfe);
  --ocb-success: var(--dsw-alias-state-success-primary, #12894f);
  --ocb-error: var(--dsw-alias-state-error-primary, #d13b3b);
  --ocb-warn: var(--dsw-alias-state-warn-primary, #b8730b);
  display: block;
  color: var(--ocb-text-1);
  font: var(--dsw-font-xs-13, 13px/20px var(--dsw-font-family, system-ui));
  -webkit-font-smoothing: antialiased;
}
.ocb-root *, .ocb-root *::before, .ocb-root *::after { box-sizing: border-box; }

.ocb-eyebrow {
  font: var(--dsw-font-xxs-12, 12px/18px system-ui);
  color: var(--ocb-text-3);
  font-weight: 500;
  margin: 0 0 10px;
}

.ocb-body { display: flex; flex-direction: column; gap: 14px; }
.ocb-stack { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.ocb-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: stretch; }
.ocb-row > * { flex: 1 1 168px; min-width: 0; }

/* ---------- text ---------- */
.ocb-text {
  margin: 0;
  font: var(--dsw-font-xs-13, 13px/20px inherit);
  line-height: 1.62;
  color: var(--ocb-text-1);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.ocb-text strong { font-weight: 600; }
.ocb-text code {
  font-family: var(--dsw-font-markdown-code-block-font-family, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.92em;
  padding: 1px 4px;
  border-radius: 5px;
  background: var(--dsw-alias-markdown-inline-code, rgba(125, 133, 148, 0.14));
}

/* ---------- callout ---------- */
.ocb-callout { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; line-height: 1.62; }
.ocb-callout-icon { flex: none; margin-top: 3px; color: var(--ocb-text-3); }
.ocb-callout-body { min-width: 0; }
.ocb-callout-title { font-weight: 600; margin: 0 0 2px; }
.ocb-callout[data-tone="warning"] .ocb-callout-title { color: var(--ocb-warn); }
.ocb-callout[data-tone="error"] .ocb-callout-title { color: var(--ocb-error); }
.ocb-callout[data-tone="info"] .ocb-callout-icon { color: var(--ocb-accent); }
.ocb-callout[data-tone="success"] .ocb-callout-icon { color: var(--ocb-success); }
.ocb-callout[data-tone="warning"] .ocb-callout-icon { color: var(--ocb-warn); }
.ocb-callout[data-tone="error"] .ocb-callout-icon { color: var(--ocb-error); }
.ocb-callout[data-boxed="true"] {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--ocb-tone, var(--ocb-warn)) 20%, transparent);
  background: color-mix(in srgb, var(--ocb-tone, var(--ocb-warn)) 6%, transparent);
}
.ocb-callout[data-tone="warning"] { --ocb-tone: var(--ocb-warn); }
.ocb-callout[data-tone="error"] { --ocb-tone: var(--ocb-error); }

/* ---------- stats ---------- */
/* A metric strip, not a row of cards. No dividers: a wrapped row would leave a
   rule hanging at the start of the second line, and the typography already
   separates the numbers from their labels. */
.ocb-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  gap: 14px 22px;
}
.ocb-stat {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ocb-stat-label {
  font: var(--dsw-font-xxs-12, 12px/18px inherit);
  color: var(--ocb-text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ocb-stat-value {
  font-size: 22px;
  line-height: 26px;
  font-weight: 600;
  letter-spacing: -0.012em;
  font-variant-numeric: tabular-nums;
  color: var(--ocb-text-1);
  overflow-wrap: anywhere;
}
.ocb-delta {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  align-self: flex-start;
  font: var(--dsw-font-xxxs-11, 11px/14px inherit);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  padding: 2px 6px 2px 4px;
  border-radius: 999px;
  color: var(--ocb-text-2);
  background: color-mix(in srgb, var(--ocb-text-2) 10%, transparent);
}
.ocb-delta[data-tone="success"] { color: var(--ocb-success); background: color-mix(in srgb, var(--ocb-success) 12%, transparent); }
.ocb-delta[data-tone="error"] { color: var(--ocb-error); background: color-mix(in srgb, var(--ocb-error) 12%, transparent); }
.ocb-delta[data-tone="warning"] { color: var(--ocb-warn); background: color-mix(in srgb, var(--ocb-warn) 13%, transparent); }
.ocb-delta[data-tone="info"] { color: var(--ocb-accent); background: color-mix(in srgb, var(--ocb-accent) 11%, transparent); }

/* ---------- table ---------- */
.ocb-table-wrap { overflow-x: auto; margin: 0 -2px; padding: 0 2px; }
.ocb-table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  line-height: 20px;
}
.ocb-table th {
  text-align: left;
  font-weight: 500;
  font-size: 11.5px;
  letter-spacing: 0.01em;
  color: var(--ocb-text-3);
  padding: 0 14px 7px 0;
  border-bottom: 1px solid var(--ocb-hairline);
  white-space: nowrap;
}
.ocb-table td {
  padding: 8px 14px 8px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--ocb-hairline) 62%, transparent);
  color: var(--ocb-text-1);
  vertical-align: top;
}
.ocb-table tr:last-child td { border-bottom: none; }
.ocb-table th:last-child, .ocb-table td:last-child { padding-right: 0; }
.ocb-table [data-numeric="true"] { text-align: right; }
.ocb-table td[data-numeric="true"] { color: var(--ocb-text-1); }
.ocb-table caption { caption-side: top; text-align: left; }

/* ---------- bar chart ---------- */
.ocb-chart { display: flex; flex-direction: column; gap: 10px; }
.ocb-chart-head {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  font: var(--dsw-font-xxxs-11, 11px/14px inherit);
  color: var(--ocb-text-3);
  font-variant-numeric: tabular-nums;
}
.ocb-chart-head b { font-weight: 600; color: var(--ocb-text-2); }
.ocb-bars { display: flex; flex-direction: column; gap: 11px; }
.ocb-bar { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.ocb-bar-line { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.ocb-bar-label {
  color: var(--ocb-text-2);
  font: var(--dsw-font-xxs-12, 12px/16px inherit);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ocb-bar-value {
  color: var(--ocb-text-1);
  font-size: 12.5px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ocb-bar-share { color: var(--ocb-text-3); font-weight: 400; margin-left: 6px; }
.ocb-bar-track {
  height: 3px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ocb-hairline) 80%, transparent);
  overflow: hidden;
}
.ocb-bar-fill { display: block; height: 100%; border-radius: 999px; background: var(--ocb-accent); }
.ocb-bar-fill[data-negative="true"] { background: var(--ocb-error); }
.ocb-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font: var(--dsw-font-xxxs-11, 11px/14px inherit); color: var(--ocb-text-2); }
.ocb-legend-item { display: inline-flex; align-items: center; gap: 5px; }
.ocb-legend-dot { width: 6px; height: 6px; border-radius: 999px; background: var(--ocb-series); }
.ocb-group { display: flex; flex-direction: column; gap: 5px; padding: 7px 0 0; }
.ocb-group + .ocb-group { border-top: 1px solid color-mix(in srgb, var(--ocb-hairline) 55%, transparent); }
.ocb-group-name { font: var(--dsw-font-xxs-12, 12px/16px inherit); color: var(--ocb-text-2); }
.ocb-group-row { display: flex; align-items: center; gap: 8px; }
.ocb-group-row .ocb-bar-track { flex: 1; }
.ocb-group-row .ocb-bar-value { min-width: 46px; text-align: right; }

/* ---------- steps ---------- */
.ocb-steps { display: flex; gap: 12px; }
.ocb-steps[data-direction="row"] { flex-direction: row; align-items: flex-start; }
.ocb-steps[data-direction="row"] > .ocb-step { flex: 1 1 0; min-width: 0; position: relative; padding-right: 4px; }
.ocb-steps[data-direction="row"] > .ocb-step::after {
  content: "";
  position: absolute;
  top: 8px;
  left: 19px;
  right: -8px;
  height: 1px;
  background: var(--ocb-hairline);
}
.ocb-steps[data-direction="row"] > .ocb-step:last-child::after { display: none; }
.ocb-steps[data-direction="row"] > .ocb-step[data-done="true"]::after { background: color-mix(in srgb, var(--ocb-success) 45%, transparent); }
.ocb-steps[data-direction="column"] { flex-direction: column; gap: 0; }
.ocb-step { display: grid; grid-template-columns: 15px minmax(0, 1fr); column-gap: 10px; align-items: start; }
.ocb-steps[data-direction="row"] > .ocb-step { display: flex; flex-direction: column; gap: 7px; }
.ocb-steps[data-direction="column"] > .ocb-step { position: relative; padding-bottom: 14px; }
.ocb-steps[data-direction="column"] > .ocb-step::after {
  content: "";
  position: absolute;
  top: 18px;
  bottom: 1px;
  left: 7.5px;
  width: 1px;
  background: var(--ocb-hairline);
}
.ocb-steps[data-direction="column"] > .ocb-step[data-done="true"]::after { background: color-mix(in srgb, var(--ocb-success) 45%, transparent); }
.ocb-steps[data-direction="column"] > .ocb-step:last-child { padding-bottom: 0; }
.ocb-steps[data-direction="column"] > .ocb-step:last-child::after { display: none; }
.ocb-step-mark {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 1.5px solid var(--ocb-hairline);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: transparent;
  flex: none;
  margin-top: 2px;
  background: transparent;
}
.ocb-step[data-status="done"] .ocb-step-mark { background: var(--ocb-success); border-color: var(--ocb-success); color: #fff; }
.ocb-step[data-status="current"] .ocb-step-mark {
  border-color: var(--ocb-accent);
  color: var(--ocb-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ocb-accent) 12%, transparent);
  background: color-mix(in srgb, var(--ocb-accent) 10%, transparent);
}
.ocb-step[data-status="current"] .ocb-step-mark::before {
  content: "";
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: currentColor;
}
.ocb-step[data-status="blocked"] .ocb-step-mark { border-color: var(--ocb-error); color: var(--ocb-error); }
.ocb-step-body { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ocb-step-title { font-size: 13px; line-height: 19px; color: var(--ocb-text-2); }
.ocb-step[data-status="current"] .ocb-step-title { color: var(--ocb-text-1); font-weight: 600; }
.ocb-step[data-status="done"] .ocb-step-title { color: var(--ocb-text-2); }
.ocb-step[data-status="blocked"] .ocb-step-title { color: var(--ocb-error); }
.ocb-step-note { font: var(--dsw-font-xxs-12, 12px/18px inherit); color: var(--ocb-text-3); }
.ocb-steps[data-direction="row"] .ocb-step-body { padding-right: 6px; }

/* ---------- failure ---------- */
.ocb-fail {
  border: 1px solid color-mix(in srgb, var(--ocb-error) 26%, transparent);
  background: color-mix(in srgb, var(--ocb-error) 6%, transparent);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ocb-fail-title { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12.5px; color: var(--ocb-error); }
.ocb-fail ul { margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 3px; }
.ocb-fail li { font: var(--dsw-font-xxs-12, 12px/18px inherit); color: var(--ocb-text-2); }
.ocb-fail code { font-family: var(--dsw-font-markdown-code-block-font-family, ui-monospace, monospace); font-size: 0.94em; }
.ocb-fail details { margin-top: 2px; }
.ocb-fail summary { cursor: pointer; font: var(--dsw-font-xxs-12, 12px/18px inherit); color: var(--ocb-text-3); }
.ocb-fail pre {
  margin: 6px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--dsw-alias-markdown-code-block, rgba(125, 133, 148, 0.1));
  font-family: var(--dsw-font-markdown-code-block-font-family, ui-monospace, monospace);
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--ocb-text-2);
  overflow-x: auto;
  white-space: pre;
}

/* ---------- streaming placeholder ---------- */
.ocb-skeleton { display: flex; flex-direction: column; gap: 8px; padding: 2px 0; }
.ocb-skeleton span {
  display: block;
  height: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ocb-hairline) 90%, transparent);
  animation: ocb-pulse 1.4s ease-in-out infinite;
}
.ocb-skeleton span:nth-child(1) { width: 38%; }
.ocb-skeleton span:nth-child(2) { width: 72%; }
.ocb-skeleton span:nth-child(3) { width: 54%; }
@keyframes ocb-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 0.25; } }
@media (prefers-reduced-motion: reduce) { .ocb-skeleton span { animation: none; } }
`;
