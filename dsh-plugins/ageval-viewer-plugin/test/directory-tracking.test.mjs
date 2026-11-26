import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverLocal } from '../src/discovery.js';
import { EvidenceError } from '../src/evidence.js';
import { trackingStore } from '../src/tracking.js';

async function fixture(t) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'ageval-directory-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
async function suite(root, dataset, name, status) {
  const dir = join(root, dataset, '.ageval', 'suite-runs', name);
  await mkdir(dir, { recursive: true });
  if (status) await writeFile(join(dir, 'progress.json'), JSON.stringify({ status, n_tasks: 1 }));
  return dir;
}
const remoteScript = fileURLToPath(new URL('../src/remote-reader.py', import.meta.url));
const python = request => {
  const reply = JSON.parse(execFileSync('python3', [remoteScript, Buffer.from(JSON.stringify(request)).toString('base64')], { encoding: 'utf8' }));
  assert.equal(reply.ok, true, reply.error);
  return reply.value;
};

test('local and fixed SSH reader agree on bounded direct discovery and baseline status', async t => {
  const root = await fixture(t);
  const running = await suite(root, 'a', 'run', 'running');
  await suite(root, 'a', 'old', 'complete');
  await suite(root, 'b', 'stopped', 'cancelled');
  await suite(root, 'not-a-dataset/nested', 'nested-run', 'running');
  await mkdir(join(root, 'empty'));
  await writeFile(join(root, 'empty', 'ageval.yaml'), '');
  await symlink(join(root, 'a'), join(root, 'alias'), 'dir');
  await symlink(running, join(root, 'a', '.ageval', 'suite-runs', 'alias'), 'dir');
  await symlink(join(root, 'a', '.ageval', 'suite-runs', 'old', 'progress.json'), join(running, 'summary.json'));
  const sorted = result => result.candidates.sort((a, b) => a.suite.localeCompare(b.suite));
  for (const [path, scope, baseline] of [[root, 'parent', true], [join(root, 'a'), 'dataset', true], [root, 'parent', false]]) {
    const local = await discoverLocal(path, scope, baseline);
    const remote = python({ op: 'tracking_discover', path, scope, baseline });
    assert.deepEqual(sorted(remote), sorted(local));
    assert.deepEqual(local.datasets, scope === 'parent' ? ['a', 'b', 'empty'] : ['.']);
    assert.deepEqual(local.candidates.filter(c => c.terminal).map(c => c.suite), baseline ? (scope === 'parent' ? ['old', 'stopped'] : ['old']) : []);
  }
});

test('first baseline skips terminal runs, later scans discover new datasets and already-finished runs after restore', async t => {
  const folder = await fixture(t), root = join(folder, 'root'), file = join(folder, 'tracking.json');
  const old = await suite(root, 'a', 'old', 'complete');
  await suite(root, 'a', 'live', 'running');
  const source = { kind: 'local', path: root };
  const store = await trackingStore(file);
  const sub = await store.subscribe({ source, scope: 'parent' });
  assert.equal(sub.initialized, false);
  assert.equal((await store.subscribe({ source, scope: 'parent' })).id, sub.id);
  assert.equal((await store.scan(sub.id)).candidateCount, 2);
  const live = store.list().runs[0];
  assert.equal(live.suite, 'live');
  await store.refresh(live.id);
  await store.dispose();
  await suite(root, 'b', 'new-finished', 'complete');
  const restored = await trackingStore(file);
  t.after(() => restored.dispose());
  assert.deepEqual((await restored.scan(sub.id)).datasets, ['a', 'b']);
  assert.deepEqual(restored.list().runs.map(r => r.suite), ['live', 'new-finished']);
  assert.equal(restored.list().runs[0].stages.length, 1);
  await restored.unsubscribe(sub.id);
  assert.ok(restored.list().runs.every(r => r.subscriptionInactive));
  assert.equal(restored.list().runs[0].stages.length, 1);
  assert.equal(JSON.parse(await readFile(join(old, 'progress.json'), 'utf8')).status, 'complete');
});

test('overlapping parent and dataset scopes share histories but distinct SSH hosts remain independent', async t => {
  const folder = await fixture(t);
  const read = async () => ({ row: { status: 'running', expected: 1, pass: 0 }, tasks: [] });
  const discover = async (source, scope) => ({ path: source.path, datasets: scope === 'parent' ? ['a'] : ['.'], candidates: [{ dataset: scope === 'parent' ? 'a' : '.', suite: 'live', terminal: false }] });
  const store = await trackingStore(join(folder, 'tracking.json'), { normalize: async s => s, read, discover });
  t.after(() => store.dispose());
  const source = { kind: 'ssh', host: 'server-one', path: '/data' };
  const childSource = { ...source, path: '/data/a' };
  const parent = await store.subscribe({ source, scope: 'parent' });
  const child = await store.subscribe({ source: childSource, scope: 'dataset' });
  const other = await store.subscribe({ source: { ...childSource, host: 'server-two' }, scope: 'dataset' });
  await Promise.all([store.scan(parent.id), store.scan(child.id), store.scan(other.id)]);
  assert.equal(store.list().runs.length, 2);
  const match = store.list().runs.find(run => run.source.host === source.host);
  assert.deepEqual(new Set(match.subscriptionIds), new Set([parent.id, child.id]));
  await store.unsubscribe(parent.id);
  assert.equal(store.list().runs.find(r => r.id === match.id).subscriptionInactive, false);
  const manual = await store.register({ source: childSource, dataset: '.', suite: 'live' });
  assert.equal(manual.id, match.id);
  await store.unsubscribe(child.id);
  assert.equal(store.list().runs.find(r => r.id === match.id).subscriptionInactive, false);
  assert.equal(store.list().runs.find(r => r.id === match.id).stages.length, 1);
});

test('scan failures do not set the initial baseline or discard the last successful inventory', async t => {
  const folder = await fixture(t);
  let offline = true;
  const baselines = [];
  const source = { kind: 'ssh', host: 'server', path: '/data' };
  const store = await trackingStore(join(folder, 'tracking.json'), { normalize: async s => s, discover: async (s, scope, baseline) => {
    baselines.push(baseline);
    if (offline) throw new EvidenceError('Server offline', 502);
    return { path: '/physical-data', datasets: ['.'], candidates: [{ dataset: '.', suite: 'old', terminal: baseline }] };
  } });
  t.after(() => store.dispose());
  const sub = await store.subscribe({ source, scope: 'dataset' });
  const failure = await store.scan(sub.id);
  assert.equal(failure.initialized, false); assert.match(failure.readError, /offline/);
  offline = false;
  const success = await store.scan(sub.id);
  assert.equal(success.initialized, true); assert.equal(success.readError, null);
  assert.equal((await store.subscribe({ source, scope: 'dataset' })).id, sub.id);
  offline = true;
  const stale = await store.scan(sub.id);
  assert.equal(stale.stale, true); assert.equal(stale.lastSuccess, success.lastSuccess);
  assert.deepEqual(stale.datasets, ['.']); assert.equal(store.list().runs.length, 0);
  assert.deepEqual(baselines, [true, true, false]);
});
