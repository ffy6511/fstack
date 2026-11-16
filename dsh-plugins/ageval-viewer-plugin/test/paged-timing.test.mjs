import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { taskTimings, suiteDetail, rowOf, listSuites } from '../src/evidence.js';
import { readSuiteFileTimes } from '../src/sources.js';
import { sortSuites } from '../src/display.js';
import { timingRequests } from '../src/timing-batch.js';
import { createApi } from '../index.js';

const script = new URL('../src/remote-reader.py', import.meta.url).pathname;
function remote(request) { return JSON.parse(execFileSync('python3', [script, Buffer.from(JSON.stringify(request)).toString('base64')], { encoding: 'utf8' })); }

test('paged timing batches read summaries, return per-item errors and bound request size', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ageval-batch-')));
  const suite = join(root, '.ageval/suite-runs/s'); await mkdir(suite, { recursive: true });
  const tasks = Array.from({ length: 25 }, (_, i) => ({ task_id: 't' + i, run_id: 'r' + i }));
  await writeFile(join(suite, 'summary.json'), JSON.stringify({ tasks }));
  for (let i = 0; i < 20; i++) {
    const path = join(root, '.ageval/runs/r' + i); await mkdir(path, { recursive: true });
    await writeFile(join(path, 'summary.json'), JSON.stringify(i === 19 ? {} : { duration_ms: i * 1000 }));
    // Neither reader should parse or download the trajectory.
    await writeFile(join(path, 'trajectory.jsonl'), 'not valid JSON');
  }
  const items = tasks.slice(0, 20).map(t => ({ task: t.task_id, run: t.run_id }));
  const batch = await taskTimings(root, '.', 's', items);
  assert.equal(batch.results.length, 20); assert.equal(batch.results[0].timing.durationMs, 0);
  assert.equal(batch.results[18].timing.durationMs, 18000); assert.equal(batch.results[19].timing.durationMs, null);
  const mixed = [{ task: 't0', run: 'unrelated' }, { task: 't20', run: 'r20' }, items[0]];
  const errors = await taskTimings(root, '.', 's', mixed);
  assert.match(errors.results[0].error, /belong/); assert.match(errors.results[1].error, /unavailable/); assert.equal(errors.results[2].timing.durationMs, 0);
  const ssh = remote({ op: 'timings', path: root, dataset: '.', suite: 's', items: mixed });
  assert.equal(ssh.ok, true); assert.match(ssh.value.results[0].error, /belong/); assert.match(ssh.value.results[1].error, /unavailable/); assert.equal(ssh.value.results[2].raw.duration_ms, 0);
  for (const input of [[], Array(51).fill(items[0]), [{ task: '../', run: 'r' }]]) assert.throws(() => timingRequests(input));
  const handler = createApi({ current: () => ({ source: { kind: 'local', path: root }, scope: 'scope' }) });
  const req = { url: '/fstack-ageval/api/timings', method: 'POST', headers: { host: '127.0.0.1:1234', 'content-type': 'application/json', 'x-ageval-action': '1', 'x-ageval-source': 'scope' }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ dataset: '.', suite: 's', items })); } };
  let status, result; await handler(req, { writeHead(code) { status = code; }, end(text) { result = JSON.parse(text); } });
  assert.equal(status, 200); assert.equal(result.results.length, 20);
});

test('updated time uses declared metadata then evidenced file mtime, never creates a fake creation time', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ageval-updated-')));
  const suite = join(root, '.ageval/suite-runs/s'); await mkdir(suite, { recursive: true });
  const file = join(suite, 'summary.json'); await writeFile(file, '{}');
  const when = new Date('2026-02-01T00:00:00Z'); await utimes(file, when, when);
  const local = await suiteDetail(root, '.', 's'); assert.equal(local.row.createdAt, null); assert.equal(local.row.updatedAt, when.toISOString()); assert.equal(local.row.updatedAtSource, 'evidence-mtime');
  const ssh = remote({ op: 'suite', path: root, dataset: '.', suite: 's' }); assert.equal(Date.parse(ssh.value.modifiedAt), +when);
  // Listing omits optional filesystem metadata; a separate bounded request fills it.
  assert.equal((await listSuites(root)).rows[0].updatedAt, null);
  assert.equal(remote({ op: 'suites', path: root }).value.documents[0].modifiedAt, null);
  const items = [{ dataset: '.', suite: 's' }];
  const deferred = await readSuiteFileTimes({ kind: 'local', path: root }, items);
  assert.equal(deferred.results[0].updatedAt, when.toISOString());
  assert.equal(deferred.results[0].updatedAtSource, 'evidence-mtime');
  const remoteDeferred = remote({ op: 'suite_times', path: root, items });
  assert.equal(remoteDeferred.ok, true); assert.equal(Date.parse(remoteDeferred.value.results[0].updatedAt), +when);
  await assert.rejects(readSuiteFileTimes({ kind: 'local', path: root }, []), /1–50/);
  await assert.rejects(readSuiteFileTimes({ kind: 'local', path: root }, [{ dataset: '.', suite: '..' }]), /Invalid/);
  await assert.rejects(readSuiteFileTimes({ kind: 'github' }, items), /no filesystem/);
  await writeFile(file, JSON.stringify({ updated_at: '2026-03-01T00:00:00Z' }));
  assert.equal((await listSuites(root)).rows[0].updatedAtSource, 'updated_at');
  const row = rowOf('.', 's', { created_at: '2026-01-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z' }, null);
  assert.equal(row.updatedAt, '2026-03-01T00:00:00.000Z'); assert.equal(row.updatedAtSource, 'updated_at');
  assert.deepEqual(sortSuites([{ ...row, suite: 'old', updatedAt: local.row.updatedAt }, { ...row, suite: 'new' }, { ...row, suite: 'none', updatedAt: null }], 'updated-desc').map(r => r.suite), ['new', 'old', 'none']);
});
