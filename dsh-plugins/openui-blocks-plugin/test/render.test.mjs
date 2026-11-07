/**
 * Render tests against the SHIPPED bundle, not the source: this is the artifact
 * the harness loads, so the check covers the loader wrapper, the plugin shape
 * and the components together.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const plugin = require('../.build/client.cjs');

const call = (program, extra = {}) => ({ argsRaw: JSON.stringify({ program, ...extra }) });
const draw = (block) => renderToStaticMarkup(React.createElement(plugin.RenderUi, { block }));

test('the bundle exports a loadable client plugin', () => {
  assert.equal(plugin.name, 'openui-blocks-client');
  assert.deepEqual(plugin.inject, ['slots']);
  assert.equal(typeof plugin.apply, 'function');
});

test('a block draws its components', () => {
  const html = draw(call(
    ['root = Stack([a, b])', 'a = Stat("营收", "¥412k", "+12.4%")', 'b = Callout("仅供参考", "info")'].join('\n'),
    { title: 'Q4' },
  ));
  assert.match(html, /ocb-eyebrow/);
  assert.match(html, /ocb-stat-value/);
  assert.match(html, /¥412k/);
  assert.match(html, /ocb-delta/);
  assert.match(html, /ocb-callout/);
  assert.doesNotMatch(html, /ocb-fail/);
});

test('a bad program renders its reasons, not a blank row', () => {
  const html = draw(call('root = Stack([x])\nx = Chat("hello")'));
  assert.match(html, /This block was not drawn/);
  assert.match(html, /unknown component/);
});

test('streaming arguments draw a placeholder instead of an error', () => {
  const html = renderToStaticMarkup(React.createElement(plugin.RenderUi, {
    block: { argsRaw: '{"program":"root = Sta' },
  }));
  assert.match(html, /ocb-skeleton/);
  assert.doesNotMatch(html, /ocb-fail/);
});

test('a settled result reads its arguments off the backfilled call head', () => {
  const html = draw({
    kind: 'tool-result',
    call: { name: 'render_ui', argsRaw: JSON.stringify({ program: 'root = Stack([a])\na = Text("settled")' }) },
    content: [],
    isError: false,
  });
  assert.match(html, /settled/);
});

test('numbers right-align by column and the ranking sorts descending', () => {
  const table = draw(call('root = Stack([t])\nt = Table(["name", "n"], [["a", 1], ["b", 22]])'));
  assert.match(table, /data-numeric="true"/);

  const chart = draw(call(['root = Stack([c])', 'c = BarChart(["a", "b"], [s], "k")', 's = Series("v", [3, 9])'].join('\n')));
  assert.ok(chart.indexOf('9 k') < chart.indexOf('3 k'), 'the larger bar is drawn first');
});
