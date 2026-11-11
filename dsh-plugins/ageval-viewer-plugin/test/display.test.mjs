import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sortSuites, timingOf, formatDuration, formatTimestamp } from '../src/display.js';
import { detailOf, taskTiming } from '../src/evidence.js';

test('suite sort supports ascending/descending time and pass rate, unknowns last and does not mutate', () => {
  const rows = [{ dataset: 'b', suite: 'a', passRate: 0, createdAt: '2026-01-01T00:00:00Z' }, { dataset: 'b', suite: 'b', passRate: 1, createdAt: '2026-02-01T00:00:00Z' }, { dataset: 'b', suite: 'c', passRate: null, createdAt: null }];
  for (const sort of ['rate-desc', 'time-desc']) assert.deepEqual(sortSuites(rows, sort).map(r => r.suite), ['b','a','c']);
  for (const sort of ['rate-asc', 'time-asc']) assert.deepEqual(sortSuites(rows, sort).map(r => r.suite), ['a','b','c']);
  assert.deepEqual(rows.map(r => r.suite), ['a','b','c']);
});

test('timing projection preserves real phase timing and rejects invalid durations', () => {
  assert.deepEqual(timingOf({ phase_timing: { started_at: '2026-01-01T00:00:00Z', finished_at: '2026-01-01T00:01:00Z', total_ms: 61000 } }), { startedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:01:00.000Z', durationMs: 61000 });
  assert.equal(timingOf({ started_at: 'bad', duration_ms: -1 }).durationMs, null);
  assert.equal(timingOf({ started_at: '2026-01-01T00:00:00Z', finished_at: '2026-01-01T00:00:10Z' }).durationMs, 10000);
  assert.equal(formatDuration(0), '0 秒'); assert.equal(formatDuration(null), '耗时未记录'); assert.equal(formatTimestamp('bad'), '时间未记录');
  const detail = detailOf('.', 's', { created_at: '2026-01-01T00:00:00Z', tasks: [{ task_id: 't', run_id: 'r' }], attempts: [{ run_id: 'r', started_at: '2026-01-01T00:01:00Z', duration_ms: 12 }] }, null);
  assert.equal(detail.tasks[0].durationMs, 12); assert.ok(detail.tasks[0].startedAt);
});

test('local and SSH script timing reads only selected summary and validates run membership', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ageval-timing-')));
  const suite = join(root, '.ageval/suite-runs/s'), run = join(root, '.ageval/runs/r');
  await mkdir(suite, { recursive: true }); await mkdir(run, { recursive: true });
  await writeFile(join(suite, 'summary.json'), JSON.stringify({ tasks: [{ task_id: 't', run_id: 'r' }], task_refs: [{ task_id: 't', run_id: 'r' }] }));
  await writeFile(join(run, 'summary.json'), JSON.stringify({ phase_timing: { started_at: '2026-01-01T00:00:00Z', total_ms: 1234 } }));
  const local = await taskTiming(root, '.', 's', 't', 'r'); assert.equal(local.durationMs, 1234);
  const invoke = request => JSON.parse(execFileSync('python3', [new URL('../src/remote-reader.py', import.meta.url).pathname, Buffer.from(JSON.stringify({ op: 'timing', path: root, dataset: '.', suite: 's', task: 't', ...request })).toString('base64')], { encoding: 'utf8' }));
  assert.equal(invoke({ run: 'r' }).value.phase_timing.total_ms, 1234);
  assert.equal(invoke({ run: 'unrelated' }).ok, false);
  await assert.rejects(taskTiming(root, '.', 's', 't', 'unrelated'), /does not belong/);
});
