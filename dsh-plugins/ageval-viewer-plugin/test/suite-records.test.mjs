import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, readFile, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inspectSuiteRecord, recycleSuiteRecord, suiteRemovalService } from '../src/suite-records.js';
import { createSuiteRemoval } from '../src/sources.js';
import { createApi } from '../index.js';

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ageval-removal-')));
  for (const [suite, status] of [['s1', 'complete'], ['s2', 'failed'], ['live', 'running'], ['unknown', 'unknown']]) {
    const path = join(root, '.ageval/suite-runs', suite);
    await mkdir(path, { recursive: true }); await writeFile(join(path, 'summary.json'), JSON.stringify({ status }));
  }
  const run = join(root, '.ageval/runs/shared'); await mkdir(run, { recursive: true });
  await writeFile(join(run, 'trajectory.jsonl'), 'keep trajectory');
  return { root, source: { kind: 'local', path: root } };
}
const python = new URL('../src/remote-reader.py', import.meta.url).pathname;
function remote(request) { return JSON.parse(execFileSync('python3', [python, Buffer.from(JSON.stringify(request)).toString('base64')], { encoding: 'utf8' })); }

test('local suite removal previews, checks fingerprints and moves exact directory only', async () => {
  const { root, source } = await fixture(); const service = createSuiteRemoval();
  const plan = await service.preview(source, [{ dataset: '.', suite: 's1' }, { dataset: '.', suite: 's1' }], 'scope');
  assert.equal(plan.items.length, 1); assert.ok((await stat(plan.items[0].path)).isDirectory());
  await assert.rejects(service.confirm(source, plan.token, 'wrong'), /source changed/);
  const result = await service.confirm(source, plan.token, 'scope');
  assert.equal(result.removed.length, 1); assert.equal(result.errors.length, 0);
  assert.ok(result.removed[0].to.includes('/.ageval/suite-run-trash/s1-'));
  assert.equal(await readFile(join(result.removed[0].to, 'summary.json'), 'utf8'), '{"status":"complete"}');
  await assert.rejects(stat(join(root, '.ageval/suite-runs/s1')), { code: 'ENOENT' });
  assert.ok((await stat(join(root, '.ageval/suite-runs/s2'))).isDirectory());
  assert.equal(await readFile(join(root, '.ageval/runs/shared/trajectory.jsonl'), 'utf8'), 'keep trajectory');
  await assert.rejects(service.confirm(source, plan.token, 'scope'), /expired/);
  for (const suite of ['live', 'unknown']) await assert.rejects(inspectSuiteRecord(root, '.', suite), /terminal/);
  const old = await inspectSuiteRecord(root, '.', 's2');
  await writeFile(join(old.path, 'summary.json'), '{"status":"failed","changed":true}');
  await assert.rejects(recycleSuiteRecord(root, old), /changed/);
  await symlink(join(root, '.ageval/suite-runs/s2'), join(root, '.ageval/suite-runs/link'));
  await assert.rejects(inspectSuiteRecord(root, '.', 'link'), /real directories/);
  await assert.rejects(service.preview({ kind: 'github' }, [{ dataset: '.', suite: 's2' }], 'scope'), /read-only/);
  await assert.rejects(inspectSuiteRecord(root, '..', 's2'), /Invalid/);
});

test('removal plans expire and preserve per-item partial failure results', async () => {
  let now = 0;
  const service = suiteRemovalService({ now: () => now, inspect: async (_, dataset, suite) => ({ dataset, suite }), recycle: async (_, item) => { if (item.suite === 'bad') throw new Error('changed'); return item; } });
  const source = { kind: 'ssh', host: 'configured', path: '/data' };
  let plan = await service.preview(source, [{ dataset: '.', suite: 's' }], 'scope'); now = 120000;
  await assert.rejects(service.confirm(source, plan.token, 'scope'), /expired/);
  plan = await service.preview(source, [{ dataset: '.', suite: 'good' }, { dataset: '.', suite: 'bad' }], 'scope');
  const result = await service.confirm(source, plan.token, 'scope');
  assert.equal(result.removed.length, 1); assert.equal(result.errors.length, 1);
});

test('SSH script recycle has same containment, terminal and fingerprint guards', async () => {
  const { root } = await fixture();
  const request = { path: root, dataset: '.', suite: 's1' };
  const preview = remote({ ...request, op: 'remove_preview' }); assert.equal(preview.ok, true);
  assert.equal(remote({ ...request, suite: 'live', op: 'remove_preview' }).ok, false);
  assert.equal(remote({ ...request, suite: '../', op: 'remove_preview' }).ok, false);
  const changed = remote({ ...request, suite: 's2', op: 'remove_preview' }).value;
  await writeFile(join(changed.path, 'summary.json'), '{"status":"failed","changed":true}');
  assert.equal(remote({ path: root, op: 'remove_confirm', expected: changed }).ok, false);
  const moved = remote({ path: root, op: 'remove_confirm', expected: preview.value });
  assert.equal(moved.ok, true); assert.ok(moved.value.to.includes('suite-run-trash/s1-'));
  assert.equal(await readFile(join(root, '.ageval/runs/shared/trajectory.jsonl'), 'utf8'), 'keep trajectory');
});

test('removal API binds one-use preview to selected source and rejects cross-origin writes', async () => {
  const { root, source } = await fixture();
  const handler = createApi({ current: () => ({ source, scope: 'scope' }) });
  async function call(path, body, headers = {}) {
    const req = { url: '/fstack-ageval/api' + path, method: 'POST', headers: { host: '127.0.0.1:1234', 'content-type': 'application/json', 'x-ageval-action': '1', 'x-ageval-source': 'scope', ...headers }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } };
    let status, result; await handler(req, { writeHead(code) { status = code; }, end(text) { result = JSON.parse(text); } }); return { status, result };
  }
  const body = { selections: [{ dataset: '.', suite: 's1' }] };
  assert.equal((await call('/suites/remove/preview', body, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await call('/suites/remove/preview', body, { 'x-ageval-source': 'old' })).status, 409);
  const preview = await call('/suites/remove/preview', body); assert.equal(preview.status, 200);
  const confirmation = await call('/suites/remove/confirm', { token: preview.result.token });
  assert.equal(confirmation.status, 200); assert.equal(confirmation.result.removed.length, 1);
  assert.ok((await stat(join(root, '.ageval/suite-runs/s2'))).isDirectory());
});
