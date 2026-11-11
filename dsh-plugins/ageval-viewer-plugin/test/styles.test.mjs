import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('UI consumes official host primitives and theme aliases, without legacy palette fallbacks', async () => {
  const client = await readFile(new URL('../src/client.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/client.css', import.meta.url), 'utf8');
  const bundle = await readFile(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(client, /Button as HostButton, Checkbox as HostCheckbox, Input as HostInput/);
  assert.match(client, /size: 'sm', variant: accent \? 'primary' : quiet \? 'ghost' : 'outline'/);
  assert.match(bundle, /require\("@deepseek-ai\/dsh-client-ui-primitives"\)/);
  assert.doesNotMatch(css, /var\(--(?:surface-|text-|font-sans|font-mono|radius[,)]|border[,)]|border-strong[,)] )/);
  for (const token of ['--dsw-alias-bg-layer-2', '--dsw-radius-sm', '--dsw-radius-md', '--dsw-radius-panel', '--dsw-focus-ring-color', '--dsw-font-family']) assert.ok(css.includes(token), token);
  assert.doesNotMatch(css, /font-weight: (?:600|700)|font-size: 10px/);
  assert.match(client, /closest\('input,button,label'\)/);
  assert.match(client, /h\('table', \{ className: 'ageval-suite-table'/);
  assert.match(client, /h\('colgroup'/);
  assert.match(client, /scope: 'rowgroup'/);
  assert.match(css, /table-layout: fixed/);
  assert.match(css, /\.ageval-col-time \{\s*width: 168px;/);
  assert.match(client, /h\('td', \{ className: 'ageval-table-time' \}/);
  assert.match(client, /SegmentedControl as HostSegments/);
  assert.doesNotMatch(client, /className: 'ageval-chip'/);
  const codeFontRules = css.match(/[^{}]+\{[^{}]*--ds-font-family-code[^{}]*\}/g) ?? [];
  assert.ok(codeFontRules.length > 0);
  for (const rule of codeFontRules) assert.match(rule, /^\s*(?:\.ageval-codeblock,\s*\.ageval-file pre|\.ageval-inline-code)\s*\{/);
});
