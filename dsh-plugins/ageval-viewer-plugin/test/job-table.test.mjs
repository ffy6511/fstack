import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function load() {
  let plugin;
  const react = { createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }) };
  const window = { __ModuleLoader__: { load({ factory }) { plugin = factory(name => name === 'react' ? react : {}); } } };
  vm.runInNewContext((await readFile(new URL('../client.js', import.meta.url), 'utf8')).replace('return module.exports.default ?? module.exports;', 'return module.exports;'), { window, console });
  return plugin;
}
const nodes = tree => [tree, ...(tree.children || []).filter(n => n && typeof n === 'object').flatMap(nodes)];
const text = tree => typeof tree !== 'object' ? String(tree ?? '') : (tree.children || []).map(text).join('');
const rowCells = row => row.children.map(cell => cell.children[0]?.props?.field ? cell.children[0].type(cell.children[0].props) : cell.children[0]);

test('jobs use aligned table columns, preserve zero scores and isolate attempt controls from navigation', async () => {
  const plugin = await load(); let opened, changed;
  const task = { taskId: 'very-long-task-name', status: 'failed', score: 0, errorTitle: 'Timeout', errorMessage: 'Detailed error', runId: 'r2', runIds: ['r1', 'r2'] };
  const table = plugin.JobTable({ tasks: [task, { taskId: 'waiting', status: 'pending' }], runs: { [task.taskId]: 'r1' }, timings: {}, loading: true,
    onRunChange: (...args) => { changed = args; }, onAttempt: (...args) => { opened = args; } });
  assert.equal(table.type, 'table');
  assert.equal(table.props['aria-label'], 'Jobs');
  assert.equal(table.children[0].children.length, 7);
  assert.deepEqual(Array.from(table.children[1].children[0].children, text), ['Task', '结果', '得分', 'Attempt', '开始时间', '完成时间', '耗时']);
  assert.ok(table.children[1].children[0].children.every(cell => cell.props.scope === 'col'));
  const rows = table.children[2].children;
  assert.equal(rows[0].children.length, 7);
  assert.equal(rows[0].children[0].children[1].props.title, 'Detailed error');
  assert.equal(text(rows[0].children[1]), 'fail');
  assert.equal(text(rows[0].children[2]), '0');
  assert.equal(text(rows[1].children[2]), '未记录');
  assert.equal(text(rows[1].children[3]), '尚无 attempt');
  rows[0].props.onClick({ target: { closest: () => null } }); assert.deepEqual(opened, [task, 'r1']);
  opened = null;
  rows[0].props.onClick({ target: { closest: selector => { assert.ok(selector.includes('[role="option"]')); return {}; } } }); assert.equal(opened, null);
  rows[0].children[0].children[0].props.onClick(); assert.deepEqual(opened, [task, 'r1']);
  assert.equal(rows[0].children[0].children[0].type, 'button');
  const select = rows[0].children[3].children[0];
  assert.equal(select.props.value, 'r1'); assert.equal(select.props.aria, 'Attempt · ' + task.taskId);
  select.props.onChange('r2'); assert.deepEqual(changed, [task.taskId, 'r2']);
  opened = null; rows[1].props.onClick({ target: { closest: () => null } }); assert.equal(opened, null);
  assert.equal(rows[1].children[0].children[0].type, 'span');
});

test('job time columns distinguish real fields, missing values, loading and per-attempt errors', async () => {
  const plugin = await load();
  const task = { taskId: 'task', status: 'pass', runId: 'current', startedAt: '2026-11-16T00:00:00Z', durationMs: 0 };
  const cells = ({ run = 'current', result, loading = false } = {}) => {
    const table = plugin.JobTable({ tasks: [task], runs: { task: run }, timings: result ? { [JSON.stringify(['task', run])]: result } : {}, loading, onRunChange() {}, onAttempt() {} });
    return rowCells(table.children[2].children[0]).slice(4);
  };
  let values = cells();
  assert.equal(values[0].type, 'time'); assert.equal(values[0].props.dateTime, task.startedAt);
  assert.equal(text(values[1]), '未记录'); assert.equal(text(values[2]), '0 秒');
  values = cells({ run: 'older', loading: true }); assert.ok(values.every(cell => text(cell) === '读取中…'));
  values = cells({ run: 'older', result: { timing: { finishedAt: '2026-11-16T00:01:00Z' } } });
  assert.equal(text(values[0]), '未记录'); assert.equal(values[1].props.dateTime, '2026-11-16T00:01:00Z'); assert.equal(text(values[2]), '未记录');
  values = cells({ run: 'older', result: { timing: {} } }); assert.ok(values.every(cell => text(cell) === '未记录'));
  values = cells({ run: 'older', result: { error: 'Read denied' } }); assert.ok(values.every(cell => text(cell) === '读取失败' && cell.props.title === 'Read denied'));
  assert.ok(nodes(plugin.JobTable({ tasks: [], runs: {}, timings: {}, loading: false, onRunChange() {}, onAttempt() {} })).some(node => node.type === 'tbody'));
});
