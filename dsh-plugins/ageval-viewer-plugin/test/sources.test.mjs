import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { configAliases, assertHost } from '../src/remote.js';
import { sourceState, keyOf, contextFor } from '../src/sources.js';
import { detailOf } from '../src/evidence.js';
const python = new URL('../src/remote-reader.py', import.meta.url).pathname;
function remote(request) { return JSON.parse(execFileSync('python3', [python, Buffer.from(JSON.stringify(request)).toString('base64')], { encoding: 'utf8' })); }

test('source migration and saved sources survive reload and failed selection', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ageval-sources-'));
  const config = join(dir, 'config.json');
  await writeFile(config, JSON.stringify({ root: dir }));
  const state = await sourceState(config);
  assert.equal(state.current().source.kind, 'local');
  const scope = state.current().scope;
  await state.select({ kind: 'local', path: dir });
  assert.notEqual(state.current().scope, scope);
  await state.select({ kind: 'local', path: dir });
  assert.equal(state.current().recent.length, 1);
  await assert.rejects(state.select({ kind: 'local', path: join(dir, 'missing') }));
  const restored = await sourceState(config);
  assert.equal(keyOf(restored.current().source), await realpath(dir));
  assert.equal(restored.current().recent.length, 1);
});

test('removing saved sources changes records only and stays removed after restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ageval-forget-'));
  const local = { kind: 'local', path: await realpath(dir) };
  const ssh = { kind: 'ssh', host: 'offline.example', path: '/unreachable/datasets' };
  const config = join(dir, 'config.json');
  const evidence = join(dir, 'do-not-delete.txt');
  await writeFile(evidence, 'evidence remains');
  await writeFile(config, JSON.stringify({ version: 2, source: local, recent: [local, ssh] }));
  const state = await sourceState(config);
  const scope = state.current().scope;
  await state.removeSaved(ssh); // No SSH connection or remote validation is necessary.
  assert.deepEqual(state.current().recent, [local]);
  await state.removeSaved(local);
  assert.deepEqual(state.current().recent, []);
  assert.deepEqual(state.current().source, local);
  assert.equal(state.current().scope, scope);
  assert.equal(await readFile(evidence, 'utf8'), 'evidence remains');
  const restored = await sourceState(config);
  assert.deepEqual(restored.current().recent, []);
  assert.deepEqual(restored.current().source, local);
  await restored.removeSaved(ssh); // Repeated removal is harmless.
  assert.deepEqual(restored.current().recent, []);
});

test('only literal configured aliases can be connected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ageval-hosts-'));
  const config = join(dir, 'config');
  const child = join(dir, 'included');
  await writeFile(config, `Host test-host *.wild !negated\nInclude ${child}\nHost second third\n`);
  await writeFile(child, `Host included\nInclude ${config}\n`);
  assert.deepEqual(await configAliases(config), ['included', 'second', 'test-host', 'third']);
  for (const host of ['-oProxyCommand=touch /tmp/pwn', 'host;echo pwn', 'nonexistent-config-alias']) await assert.rejects(assertHost(host));
});

test('remote reader shares metadata semantics, bounds evidence, rejects traversal and symlinks', async () => {
  const base = await mkdtemp(join(tmpdir(), 'ageval-remote-'));
  const root = join(base, 'data');
  const suite = join(root, 'bench/.ageval/suite-runs/s1');
  const run = join(root, 'bench/.ageval/runs/r1');
  await mkdir(suite, { recursive: true }); await mkdir(run, { recursive: true });
  const summary = { counts: { pass: 1, fail: 0, error: 1 }, status: 'complete', model_label: 'test', n_tasks: 2, tasks: [{ task_id: 't1', status: 'pass' }], task_refs: [{ task_id: 't1', attempt_run_ids: ['r1'] }] };
  await writeFile(join(suite, 'summary.json'), JSON.stringify(summary));
  await writeFile(join(run, 'trajectory.jsonl'), '{"type":"turn","role":"user","content":"hello"}\n');
  await writeFile(join(run, 'result.json'), '{"ok":true}');
  const listed = remote({ op: 'suites', path: root });
  assert.equal(listed.ok, true); assert.equal(listed.value.documents.length, 1);
  const detail = detailOf('bench', 's1', summary, null);
  assert.deepEqual(detail.tasks[0].runIds, ['r1']);
  const attempt = remote({ op: 'attempt', path: root, dataset: 'bench', suite: 's1', task: 't1', run: 'r1' });
  assert.equal(attempt.ok, true); assert.equal(attempt.value.files['trajectory.jsonl'].truncated, false);
  assert.equal(remote({ op: 'suite', path: root, dataset: '../', suite: 's1' }).ok, false);
  assert.equal(remote({ op: 'attempt', path: root, dataset: 'bench', suite: 's1', task: 't1', run: 'unrelated' }).ok, false);
  await symlink('/etc/passwd', join(run, 'summary.json'));
  assert.equal(remote({ op: 'attempt', path: root, dataset: 'bench', suite: 's1', task: 't1', run: 'r1' }).ok, false);
});
