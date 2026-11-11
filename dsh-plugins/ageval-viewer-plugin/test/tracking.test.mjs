import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { trackingStore } from '../src/tracking.js';
import { EvidenceError } from '../src/evidence.js';
import { createApi } from '../index.js';

const source = { kind: 'local', path: '/fixture/dataset' };
const input = { source, dataset: '.', suite: 'suite', title: 'Tracked fixture' };
function detail(pass = 1, fail = 0, error = 0, expected = 3) {
  return { row: { dataset: '.', suite: 'suite', pass, fail, error, finished: pass + fail + error, expected, status: 'running', hasSummary: false }, tasks: [{ taskId: 't1', status: pass ? 'pass' : 'error' }], errors: {} };
}
async function setup(options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'ageval-tracking-'));
  const file = join(directory, 'tracking.json');
  const store = await trackingStore(file, { normalize: async s => s, ...options });
  return { store, file, directory };
}

test('registration deduplicates; refresh records real stage deltas and survives restore', async () => {
  let time = Date.now(), value = detail();
  const { store, file } = await setup({ read: async () => value, now: () => time });
  const run = await store.register(input);
  assert.equal(run.stages.length, 1); assert.equal(run.latest.row.pass, 1);
  assert.equal((await store.register(input)).id, run.id); assert.equal(store.list().runs.length, 1);
  time += 60000; value = detail(2, 0, 0);
  const refreshed = await store.refresh(run.id);
  assert.equal(refreshed.stages.length, 3); assert.equal(refreshed.latest.delta.pass, 1);
  const checkpoint = await store.refresh(run.id, { label: 'batch done', checkpoint: true });
  assert.equal(checkpoint.stages.length, 4); assert.equal(checkpoint.stages[3].delta.pass, 0);
  assert.equal('states' in checkpoint.latest, false); assert.equal('stageStates' in checkpoint, false);
  await store.archive(run.id);
  const restored = await trackingStore(file);
  assert.equal(restored.list().runs[0].archived, true); assert.equal(restored.list().runs[0].stages.length, 4);
  await restored.dispose(); await store.dispose();
});

test('analysis context keeps mixed sources separate and evidence reads ignore viewer selection', async () => {
  const calls = [];
  const { store } = await setup({ read: async source => { calls.push(source); return detail(); }, attempt: async (source, dataset, suite, task, run) => ({ source, task, run }) });
  const local = await store.register(input);
  const sshSource = { kind: 'ssh', host: 'remote', path: '/remote/data' };
  const remote = await store.register({ ...input, source: sshSource });
  const before = calls.length;
  const context = store.context([local.id, remote.id, local.id], 'Compare errors');
  assert.equal(context.items.length, 2); assert.equal(calls.length, before);
  assert.deepEqual(context.items[1].source, sshSource);
  assert.ok(context.text.includes('ageval_read_tracked_suite'));
  assert.ok(context.text.includes('NOT a fresh read'));
  assert.equal('states' in context.items[0].latest, false);
  const fresh = await store.evidence(remote.id);
  assert.deepEqual(fresh.source, sshSource); assert.equal(fresh.evidence.row.pass, 1); assert.ok(fresh.readAt);
  const attempt = await store.evidence(local.id, 't1', 'r1'); assert.equal(attempt.evidence.task, 't1');
  assert.throws(() => store.context([], ''), /Select/);
  assert.throws(() => store.context([local.id], 'x'.repeat(12001)), /long/);
  assert.throws(() => store.context(['unknown']), /not found/);
  await store.dispose();
});

test('stage retention preserves first observation and newest stages', async () => {
  let time = Date.now();
  const { store } = await setup({ read: async () => detail(), now: () => time });
  const run = await store.register(input);
  const baseline = run.stages[0].at;
  for (let i = 0; i < 50; i++) { time += 1000; await store.refresh(run.id, { label: `stage-${i}`, checkpoint: true }); }
  const stages = store.list().runs[0].stages;
  assert.equal(stages.length, 48); assert.equal(stages[0].at, baseline); assert.equal(stages.at(-1).label, 'stage-49');
  await store.dispose();
});

test('read failures keep last valid results; missing records are waiting, not FAIL', async () => {
  let unavailable = false;
  const { store } = await setup({ read: async () => { if (unavailable) throw new EvidenceError('offline', 502); return detail(); } });
  const run = await store.register(input); unavailable = true;
  const failed = await store.refresh(run.id);
  assert.equal(failed.observation, 'unavailable'); assert.equal(failed.latest.row.pass, 1); assert.equal(failed.stages.length, 2); assert.equal(failed.stages[1].row, null); assert.ok(failed.stages[1].readError);
  await store.dispose();
  const waiting = await setup({ read: async () => { throw new EvidenceError('No summary yet', 404); } });
  const registered = await waiting.store.register(input);
  assert.equal(registered.observation, 'waiting'); assert.equal(registered.latest, null);
  await waiting.store.dispose();
});

test('GitHub follow mode pins each sample, named stages record transitions and changed totals reset comparison', async () => {
  let revision = 0, value = detail(0, 0, 1);
  const { store } = await setup({ read: async s => { assert.equal(s.commit, String(revision).repeat(40)); return value; }, resolveGithub: async s => ({ ...s, commit: String(++revision).repeat(40) }) });
  const run = await store.register({ ...input, source: { kind: 'github', repo: 'owner/repo', path: '', ref: 'main' } });
  value = detail(1);
  const next = await store.refresh(run.id, { checkpoint: true });
  assert.equal(next.stages[1].delta.transitions['error → pass'], 1); assert.equal(next.latest.revision, '2'.repeat(40));
  value = detail(1, 0, 0, 4);
  assert.equal((await store.refresh(run.id, { checkpoint: true })).latest.delta.comparable, false);
  await store.dispose();
});

test('real local tracking reuses evidence readers without touching source files or selected config', async () => {
  const { directory, file, store: unused } = await setup(); await unused.dispose();
  const root = join(directory, 'dataset'), suite = join(root, '.ageval/suite-runs/suite');
  await mkdir(suite, { recursive: true });
  const path = join(suite, 'progress.json');
  const text = JSON.stringify({ status: 'running', n_tasks: 2, counts: { pass: 1, fail: 0, error: 0 }, tasks: [{ task_id: 't1', status: 'pass' }] });
  await writeFile(path, text);
  const store = await trackingStore(file);
  const run = await store.register({ ...input, source: { kind: 'local', path: root } });
  assert.equal(run.latest.row.pass, 1); assert.equal((await store.detail(run.id)).tasks[0].taskId, 't1');
  await store.archive(run.id); assert.equal(await readFile(path, 'utf8'), text);
  await store.remove(run.id); assert.equal(await readFile(path, 'utf8'), text); assert.equal(store.list().runs.length, 0);
  await assert.rejects(store.register({ ...input, source: { kind: 'local', path: 'relative' } }), /absolute/);
  await store.dispose();
});

test('same-run concurrent refreshes coalesce and disposed service cannot write', async () => {
  let calls = 0, release, block = false;
  const { store } = await setup({ read: async () => { calls++; if (block) await new Promise(resolve => { release = resolve; }); return detail(); } });
  const run = await store.register(input); block = true;
  const a = store.refresh(run.id), b = store.refresh(run.id); while (!release) await new Promise(resolve => setImmediate(resolve)); release(); await Promise.all([a, b]);
  assert.equal(calls, 2);
  await store.dispose(); await assert.rejects(store.archive(run.id), /unloaded/);
});

test('manual refresh always appends a stable-ID row and deleting one stage preserves suite and other history', async () => {
  let time = Date.now(), value = detail();
  const { store, file } = await setup({ now: () => time, read: async () => value });
  const run = await store.register(input);
  time += 1000; const second = await store.refresh(run.id);
  assert.equal(second.stages.length, 2); assert.equal(second.stages[1].delta.pass, 0);
  time += 1000; value = detail(2); const third = await store.refresh(run.id);
  const removed = third.stages[1].id;
  await store.removeStage(run.id, removed);
  const remaining = store.list().runs[0];
  assert.equal(remaining.id, run.id); assert.equal(remaining.stages.length, 2);
  assert.equal(remaining.stages[0].id, run.stages[0].id);
  assert.equal(remaining.stages[1].id, third.stages[2].id);
  assert.equal(remaining.stages[1].delta.comparable, false);
  assert.equal(remaining.latest.row.pass, 2);
  await store.removeStage(run.id, third.stages[2].id);
  assert.equal(store.list().runs[0].suppressLatestPreview, true);
  await store.dispose(); const restored = await trackingStore(file);
  assert.equal(restored.list().runs.length, 1); assert.equal(restored.list().runs[0].stages.length, 1);
  await assert.rejects(restored.removeStage(run.id, 'missing'), /not found/);
  await restored.dispose();
});

test('manual mode persists, skips automatic samples and still permits explicit refresh', async () => {
  let time = Date.now(), calls = 0;
  const { store, file } = await setup({ now: () => time, read: async () => { calls++; return detail(); } });
  const run = await store.register(input);
  assert.equal(run.autoUpdate, true);
  await store.setAutoUpdate(run.id, false); time += 61000;
  store.start(); await new Promise(resolve => setTimeout(resolve, 1150)); assert.equal(calls, 1);
  await store.refresh(run.id); assert.equal(calls, 2);
  assert.equal(store.list().runs[0].autoUpdate, false);
  await store.dispose();
  const restored = await trackingStore(file, { normalize: async s => s, read: async () => detail() });
  assert.equal(restored.list().runs[0].autoUpdate, false);
  await restored.setAutoUpdate(run.id, true); assert.equal(restored.list().runs[0].autoUpdate, true);
  await restored.remove(run.id); await restored.dispose();
  const deleted = await trackingStore(file); assert.equal(deleted.list().runs.length, 0); await deleted.dispose();
});

test('deletion waits for in-flight reading and cannot be repopulated by that sample', async () => {
  let block = false, release;
  const { store } = await setup({ read: async () => { if (block) await new Promise(resolve => { release = resolve; }); return detail(); } });
  const run = await store.register(input); block = true;
  const refreshing = store.refresh(run.id); while (!release) await new Promise(resolve => setImmediate(resolve));
  const removing = store.remove(run.id);
  await assert.rejects(store.refresh(run.id), /being removed/);
  release(); await Promise.all([refreshing, removing]); assert.equal(store.list().runs.length, 0);
  await store.dispose();
});

test('Host sampler refreshes without Agent or page, skips archived and completed records', async () => {
  let time = Date.now(), calls = 0;
  const { store } = await setup({ now: () => time, read: async (_source, _dataset, suite) => {
    calls++; const value = detail();
    if (suite === 'done') { value.row.hasSummary = true; value.row.status = 'complete'; }
    return value;
  } });
  const active = await store.register(input);
  const archived = await store.register({ ...input, suite: 'archived' }); await store.archive(archived.id);
  await store.register({ ...input, suite: 'done' });
  assert.equal(calls, 3); time += 61000;
  store.start();
  await new Promise(resolve => setTimeout(resolve, 1150));
  assert.equal(calls, 4); assert.equal(store.list().runs.find(r => r.id === active.id).lastSuccess, new Date(time).toISOString());
  await store.dispose();
});

test('tracking APIs do not depend on selected source and reject cross-origin writes', async () => {
  const { store } = await setup({ read: async () => detail() });
  const handler = createApi({ current() { throw new Error('Selected-source state must not be read'); } }, null, store);
  async function call(path, method = 'GET', body = {}, headers = {}) {
    const req = { url: '/fstack-ageval/api' + path, method, headers: { host: '127.0.0.1:1234', 'content-type': 'application/json', 'x-ageval-action': '1', ...headers }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } };
    let status, response;
    await handler(req, { writeHead(code) { status = code; }, end(text) { response = JSON.parse(text); } });
    return { status, response };
  }
  assert.equal((await call('/tracking')).status, 200);
  const registered = await call('/tracking/register', 'POST', input);
  assert.equal(registered.status, 200);
  const context = await call('/tracking/context', 'POST', { ids: [registered.response.id], question: 'Analyze' });
  assert.equal(context.status, 200); assert.equal(context.response.items[0].id, registered.response.id);
  assert.equal((await call('/tracking/context', 'POST', { ids: [] })).status, 400);
  assert.equal((await call('/tracking/context', 'POST', { ids: [registered.response.id] }, { origin: 'https://evil.test' })).status, 403);
  const refreshResponse = await call('/tracking/refresh', 'POST', { id: registered.response.id });
  assert.equal(refreshResponse.status, 200);
  const stageId = refreshResponse.response.stages.at(-1).id;
  assert.equal((await call('/tracking/stage/remove', 'POST', { id: registered.response.id, stageId }, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await call('/tracking/stage/remove', 'POST', { id: registered.response.id, stageId })).status, 200);
  assert.equal(store.list().runs.length, 1);
  assert.equal((await call('/tracking/register', 'POST', input, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await call('/tracking/auto-update', 'POST', { id: registered.response.id, enabled: false })).response.autoUpdate, false);
  assert.equal((await call('/tracking/auto-update', 'POST', { id: registered.response.id, enabled: 'no' })).status, 400);
  assert.equal((await call('/tracking/remove', 'POST', { id: registered.response.id }, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await call('/tracking/remove', 'POST', { id: registered.response.id })).status, 200);
  assert.equal(store.list().runs.length, 0);
  await store.dispose();
});
