import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('tracked selection sends ID context to current/new sessions without changing data source', async () => {
  let plugin, cursor = 0;
  const state = [], sent = [], requests = [], created = [];
  const record = { id: 'tracked-1', title: 'Remote suite', source: { kind: 'ssh', host: 'host', path: '/data' }, dataset: '.', suite: 'suite', stages: [], refreshSeconds: 60 };
  const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat() });
  const react = { createElement: h, useState(initial) { const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; }, useRef(initial) { const index = cursor++; return state[index] ||= { current: initial }; }, useEffect() { cursor++; }, useCallback(fn) { cursor++; return fn; } };
  const ctx = { sessions: { create: async options => { created.push(options); return 'new-session'; }, scope: id => ({ get: () => ({ send: async text => { sent.push({ id, text }); } }) }) } };
  const fetch = async (url, init) => { requests.push({ url, init }); return { ok: true, json: async () => ({ text: 'tracked evidence context' }) }; };
  const window = { __ModuleLoader__: { load({ factory }) { plugin = factory(name => name === 'react' ? react : {}); } } };
  vm.runInNewContext((await readFile(new URL('../client.js', import.meta.url), 'utf8')).replace('return module.exports.default ?? module.exports;', 'return module.exports;'), { window, fetch, Headers, console, Set });
  const render = () => { cursor = 0; return plugin.TrackingPanel({ ctx, props: { sessionId: 'current-session' } }); };
  function nodes(tree) { return [tree, ...tree.children.filter(x => x && typeof x === 'object').flatMap(nodes)]; }
  render();
  state[0] = ['tracked-1']; state[1] = 'Compare stages'; state[5] = [record];
  let tree = render();
  const current = nodes(tree).find(n => n.props.label === '发给当前 session');
  assert.equal(current.props.disabled, false); await current.props.onClick();
  // sendAnalysis is async; onClick starts it without returning its promise.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent[0].id, 'current-session'); assert.equal(sent[0].text, 'tracked evidence context');
  assert.equal(requests[0].url, '/fstack-ageval/api/tracking/context');
  assert.deepEqual(JSON.parse(requests[0].init.body), { ids: ['tracked-1'], question: 'Compare stages' });
  tree = render(); nodes(tree).find(n => n.props.label === '新建 session并分析').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent[1].id, 'new-session'); assert.deepEqual(JSON.parse(JSON.stringify(created[0])), {});
  assert.equal(requests.some(r => r.url.includes('/config')), false);
  state[0] = []; tree = render(); assert.equal(nodes(tree).find(n => n.props.label === '发给当前 session').props.disabled, true);
});
