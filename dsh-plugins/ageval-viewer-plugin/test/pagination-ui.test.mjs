import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function harness() {
  let plugin, cursor = 0, effects = [], dirty = false;
  const slots = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { const next = typeof value === 'function' ? value(slots[i]) : value; if (next !== slots[i]) { slots[i] = next; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useMemo(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useEffect(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) { const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const window = { __ModuleLoader__: { load({ factory }) { plugin = factory(name => name === 'react' ? react : {}); } } };
  vm.runInNewContext((await readFile(new URL('../client.js', import.meta.url), 'utf8')).replace('return module.exports.default ?? module.exports;', 'return module.exports;'), { window, console, Map, Set });
  return { plugin, render(props) { let tree; for (let n = 0; n < 15; n++) { dirty = false; cursor = 0; tree = plugin.DetailView(props); const pending = effects; effects = []; pending.forEach(fn => fn()); if (!dirty) return tree; } throw new Error('Render did not settle'); } };
}
function nodes(tree) { return [tree, ...(tree.children || []).filter(n => n && typeof n === 'object').flatMap(nodes)]; }
const button = (tree, label) => nodes(tree).find(n => n.children?.includes(label));
const tick = () => new Promise(resolve => setImmediate(resolve));

test('job UI only batches the current page, reuses results and resets filtering before reading', async () => {
  const { plugin, render } = await harness(); const calls = [];
  const tasks = Array.from({ length: 45 }, (_, i) => ({ taskId: 't' + i, runId: 'r' + i, status: 'pass' }));
  const props = { data: { row: { dataset: '.', suite: 's' }, tasks, errors: {} }, selected: false, error: '', busy: '', onBack() {}, onAttempt() {}, onTimings: async items => { calls.push(items); return { results: items.map(item => ({ taskId: item.task, runId: item.run, timing: { durationMs: 1000 } })) }; } };
  assert.equal(plugin.taskPage(tasks, 9).items.length, 5);
  let tree = render(props); await tick(); tree = render(props);
  assert.equal(calls.length, 1); assert.equal(calls[0].length, 20); assert.equal(calls[0][0].task, 't0');
  assert.equal(nodes(tree).find(n => n.type === plugin.JobTable).props.tasks.length, 20);
  button(tree, '下一页').props.onClick(); tree = render(props); await tick(); tree = render(props);
  assert.equal(calls.length, 2); assert.equal(calls[1][0].task, 't20');
  button(tree, '上一页').props.onClick(); tree = render(props); await tick(); tree = render(props); assert.equal(calls.length, 2);
  button(tree, '下一页').props.onClick(); tree = render(props);
  nodes(tree).find(n => n.props['aria-label'] === '搜索 task').props.onChange({ target: { value: 't4' } }); tree = render(props); await tick(); tree = render(props);
  assert.equal(calls.length, 3); assert.equal(calls[2].length, 5); assert.equal(calls[2][0].task, 't40');
  assert.equal(nodes(tree).find(n => n.type === plugin.JobTable).props.tasks.length, 6);
  nodes(tree).find(n => n.props.label === '重新读取本页时间').props.onClick(); render(props); await tick(); tree = render(props);
  assert.equal(calls.length, 4); assert.equal(calls[3].length, 6);
});

test('job table switches only selected attempt timing and reuses prior attempt results', async () => {
  const { plugin, render } = await harness(); const calls = [];
  const task = { taskId: 't', runId: 'new', runIds: ['old', 'new'], status: 'pass' };
  const props = { data: { row: { dataset: '.', suite: 's' }, tasks: [task], errors: {} }, selected: false, error: '', busy: '', onBack() {}, onAttempt() {},
    onTimings: async items => { calls.push(items); return { results: items.map(item => ({ taskId: item.task, runId: item.run, timing: { durationMs: item.run === 'old' ? 2000 : 1000 } })) }; } };
  let tree = render(props); await tick(); tree = render(props);
  const table = () => nodes(tree).find(n => n.type === plugin.JobTable);
  assert.equal(calls.length, 1); assert.equal(calls[0][0].run, 'new');
  assert.equal(table().props.timings[JSON.stringify(['t', 'new'])].timing.durationMs, 1000);
  table().props.onRunChange('t', 'old'); tree = render(props); await tick(); tree = render(props);
  assert.equal(calls.length, 2); assert.equal(calls[1].length, 1); assert.equal(calls[1][0].run, 'old');
  assert.equal(table().props.runs.t, 'old'); assert.equal(table().props.timings[JSON.stringify(['t', 'old'])].timing.durationMs, 2000);
  table().props.onRunChange('t', 'new'); tree = render(props); await tick(); tree = render(props);
  assert.equal(calls.length, 2); assert.equal(table().props.runs.t, 'new');
});

test('job time header sorting uses known selected Attempt times across filtered pages', async () => {
  const { plugin, render } = await harness();
  const date = day => `2026-11-${String(day).padStart(2, '0')}T00:00:00Z`;
  const tasks = Array.from({ length: 25 }, (_, i) => ({ taskId: 't' + i, runId: 'r' + i, status: i < 24 ? 'pass' : 'fail', startedAt: date(i + 1), finishedAt: date(26 - i) }));
  tasks[24].startedAt = 'invalid'; tasks[24].finishedAt = null;
  tasks[0].runIds = ['r0', 'older'];
  const calls = [];
  const props = { data: { row: { dataset: '.', suite: 's' }, tasks, errors: {} }, selected: false, error: '', busy: '', onBack() {}, onAttempt() {},
    onTimings: async items => { calls.push(items); return { results: items.map(item => ({ taskId: item.task, runId: item.run, timing: item.run === 'older' ? { finishedAt: date(28) } : {} })) }; } };
  let tree = render(props);
  const table = () => nodes(tree).find(n => n.type === plugin.JobTable).props;
  const ids = () => Array.from(table().tasks, task => task.taskId);
  const clickSort = label => {
    const content = plugin.JobTable(table());
    const control = nodes(content).find(n => n.type === 'button' && n.props['aria-label']?.startsWith('按' + label + '排序'));
    control.props.onClick(); tree = render(props);
  };
  button(tree, '下一页').props.onClick(); tree = render(props);
  clickSort('开始时间');
  assert.equal(button(tree, '上一页').props.disabled, true);
  assert.deepEqual(ids().slice(0, 2), ['t23', 't22']);
  assert.equal(calls.length, 0);
  clickSort('开始时间'); assert.deepEqual(ids().slice(0, 2), ['t0', 't1']);
  clickSort('完成时间'); assert.deepEqual(ids().slice(0, 2), ['t0', 't1']);
  const headings = plugin.JobTable(table()).children[1].children[0].children;
  assert.equal(headings[4].props['aria-sort'], undefined);
  assert.equal(headings[5].props['aria-sort'], 'descending');
  table().onRunChange('t0', 'older'); tree = render(props);
  assert.equal(ids()[0], 't1', 'latest Attempt timestamp is not reused while the older one is loading');
  await tick(); tree = render(props);
  assert.equal(ids()[0], 't0'); assert.equal(calls.length, 1); assert.equal(calls[0][0].run, 'older');
  clickSort('完成时间'); assert.deepEqual(ids().slice(0, 2), ['t23', 't22']);
  button(tree, '下一页').props.onClick(); tree = render(props); await tick(); tree = render(props);
  assert.deepEqual(ids(), ['t3', 't2', 't1', 't0', 't24']);
  assert.deepEqual(Array.from(calls[1], item => item.task), ['t24']);
  clickSort('开始时间');
  assert.equal(button(tree, '上一页').props.disabled, true);
  assert.equal(ids()[0], 't23');
  nodes(tree).find(n => n.props.id === 'ageval-task-verdict').props.onChange('fail');
  tree = render(props);
  assert.deepEqual(ids(), ['t24']);
  assert.equal(table().sort, 'startedAt-desc');
});

test('sorting a partly known time field reads only the visible batch and does not cascade on reorder', async () => {
  const { plugin, render } = await harness();
  const tasks = Array.from({ length: 45 }, (_, i) => ({ taskId: 't' + i, runId: 'r' + i, status: 'pass', durationMs: 1000 }));
  const calls = [];
  const props = { data: { row: { dataset: '.', suite: 's' }, tasks, errors: {} }, selected: false, error: '', busy: '', onBack() {}, onAttempt() {},
    onTimings: async items => { calls.push(items); return { results: items.map(item => ({ taskId: item.task, runId: item.run, timing: { startedAt: Number(item.task.slice(1)) >= 20 ? '2026-11-17T00:00:00Z' : '2026-11-16T00:00:00Z' } })) }; } };
  let tree = render(props);
  const table = () => nodes(tree).find(n => n.type === plugin.JobTable).props;
  assert.equal(calls.length, 0);
  table().onSort('startedAt-desc'); tree = render(props); await tick(); tree = render(props);
  assert.deepEqual(Array.from(calls[0], item => item.task), tasks.slice(0, 20).map(task => task.taskId));
  button(tree, '下一页').props.onClick(); tree = render(props); await tick(); tree = render(props);
  assert.equal(calls.length, 2); assert.equal(calls[1][0].task, 't20');
  assert.deepEqual(Array.from(table().tasks, task => task.taskId), tasks.slice(0, 20).map(task => task.taskId));
});
