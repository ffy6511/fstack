import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { githubReader, githubSource, githubLabel, githubAvatarUrl } from '../src/github.js';
import { sourceState, parseSource } from '../src/sources.js';

function fixture() {
  const calls = [], sha = 'a'.repeat(40);
  const summary = JSON.stringify({ model_label: 'fixture-model', status: 'complete', n_tasks: 1, counts: { pass: 1, fail: 0, error: 0 }, tasks: [{ task_id: 'task', status: 'pass' }], task_refs: [{ task_id: 'task', run_id: 'run', attempt_run_ids: ['run'] }] });
  const blob = (path, id, text, size) => ({ path, type: 'blob', mode: '100644', sha: id, size: size ?? Buffer.byteLength(text) });
  const tree = (path, id) => ({ path, type: 'tree', mode: '040000', sha: id });
  const trajectory = '{"type":"turn","role":"assistant","content":"fixture"}\n';
  const data = {
    root: [tree('datasets', 'datasets'), tree('huge-workspace', 'never-read')],
    datasets: [tree('bench', 'bench')],
    bench: [tree('.ageval', 'ageval')],
    ageval: [tree('suite-runs', 'suite-runs'), tree('runs', 'runs')],
    'suite-runs': [tree('suite', 'suite')],
    suite: [blob('summary.json', 'summary', summary)],
    runs: [tree('run', 'run')],
    run: [blob('result.json', 'result', '{"verdict":"pass"}'), blob('summary.json', 'run-summary', '{}'), blob('trajectory.jsonl', 'trajectory', trajectory), tree('evaluation', 'evaluation'), tree('box', 'never-read-box')],
    evaluation: [blob('observation.jsonl', 'too-big', '', 1024 * 1024 + 1), blob('checks.json', 'lfs', '')],
  };
  const text = { summary, result: '{"verdict":"pass"}', 'run-summary': '{}', trajectory, lfs: 'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 1000' };
  const api = async (endpoint, raw) => {
    calls.push(endpoint);
    if (endpoint.includes('/commits/')) return { sha, commit: { tree: { sha: 'root' } } };
    if (endpoint.includes('/git/trees/')) return { tree: data[endpoint.split('/').pop()], truncated: false };
    if (endpoint.includes('/git/blobs/')) { assert.equal(raw, true); return text[endpoint.split('/').pop()]; }
    throw new Error(`Unexpected request ${endpoint}`);
  };
  return { reader: githubReader(api), source: { kind: 'github', repo: 'owner/private', path: 'datasets/bench', ref: 'feature/data' }, calls, sha };
}

test('GitHub reader browses metadata and reads only selected evidence, never box/workspace', async () => {
  const { reader, source, calls, sha } = fixture();
  const resolved = await reader.resolve(source); assert.equal(resolved.commit, sha);
  assert.ok(calls.includes('repos/owner/private/commits/feature%2Fdata'));
  const listing = await reader.list({ ...source, path: 'datasets' }); assert.deepEqual(listing.entries, [{ name: 'bench', path: 'datasets/bench' }]);
  const all = await reader.suites(resolved); assert.equal(all.rows.length, 1); assert.equal(all.rows[0].passRate, 1); assert.equal(all.rows[0].clean, true);
  const detail = await reader.suite(resolved, '.', 'suite'); assert.equal(detail.tasks[0].runId, 'run');
  const a = await reader.attempt(resolved, '.', 'suite', 'task', 'run');
  assert.equal(a.files['trajectory.jsonl'].text.includes('fixture'), true);
  assert.equal(a.warnings.length, 2);
  assert.equal(calls.some(p => p.includes('never-read') || p.includes('too-big')), false);
  await assert.rejects(reader.attempt(resolved, '.', 'suite', 'task', 'other-run'), /does not belong/);
  await assert.rejects(reader.suite(resolved, '..', 'suite'), /Invalid/);
});

test('GitHub timing reads summaries only and rejects unrelated attempts', async () => {
  const { reader, source, calls } = fixture();
  assert.equal((await reader.timing(source, '.', 'suite', 'task', 'run')).durationMs, null);
  assert.equal(calls.some(p => p.includes('/git/blobs/') && !p.endsWith('/summary') && !p.endsWith('/run-summary')), false);
  await assert.rejects(reader.timing(source, '.', 'suite', 'task', 'other-run'), /does not belong/);
});

test('GitHub avatars only use the public GitHub avatar host', () => {
  assert.equal(githubAvatarUrl('https://avatars.githubusercontent.com/u/42?v=4'), 'https://avatars.githubusercontent.com/u/42?v=4&s=80');
  for (const url of [null, '', 'javascript:alert(1)', 'https://evil.test/image', 'http://avatars.githubusercontent.com/u/42', 'https://user:password@avatars.githubusercontent.com/u/42']) assert.equal(githubAvatarUrl(url), null);
});

test('GitHub cache is bounded memory metadata only, and clear forces a new read', async () => {
  const { reader, source, calls } = fixture();
  await reader.list(source);
  const status = reader.cacheStatus();
  assert.equal(status.storage, 'memory'); assert.equal(status.diskPath, null);
  assert.ok(status.entries > 0); assert.ok(status.bytes > 0);
  const count = calls.filter(p => p.includes('/git/trees/')).length;
  await reader.list(source);
  assert.equal(calls.filter(p => p.includes('/git/trees/')).length, count);
  assert.equal(reader.clearCache().entries, 0); assert.equal(reader.cacheStatus().bytes, 0);
  await reader.list(source);
  assert.ok(calls.filter(p => p.includes('/git/trees/')).length > count);
  const before = reader.cacheStatus(); await reader.suite(source, '.', 'suite');
  const afterSuite = reader.cacheStatus(); await reader.suite(source, '.', 'suite');
  assert.deepEqual(reader.cacheStatus(), afterSuite);
  assert.ok(afterSuite.entries >= before.entries);
  assert.equal(calls.filter(p => p.endsWith('/git/blobs/summary')).length, 2);
});

test('clear does not let in-flight metadata requests repopulate the cache', async () => {
  let release;
  const reader = githubReader(async endpoint => endpoint.includes('/commits/')
    ? { sha: 'a'.repeat(40), commit: { tree: { sha: 'root' } } }
    : new Promise(resolve => { release = () => resolve({ tree: [], truncated: false }); }));
  const pending = reader.list({ repo: 'owner/repo', path: '' });
  while (!release) await new Promise(resolve => setImmediate(resolve));
  reader.clearCache(); release(); await pending;
  assert.equal(reader.cacheStatus().entries, 0);
});

test('GitHub metadata cache enforces entry and byte limits', async () => {
  let id = 0;
  const reader = githubReader(async endpoint => endpoint.includes('/commits/')
    ? { sha: 'a'.repeat(40), commit: { tree: { sha: String(id++) } } }
    : { tree: [], truncated: false });
  for (let i = 0; i < 260; i++) await reader.list({ repo: 'owner/repo', path: '' });
  assert.equal(reader.cacheStatus().entries, 256);
  const huge = githubReader(async endpoint => endpoint.includes('/commits/')
    ? { sha: 'a'.repeat(40), commit: { tree: { sha: 'root' } } }
    : { tree: [], truncated: false, padding: 'x'.repeat(16 * 1024 * 1024) });
  await huge.list({ repo: 'owner/repo', path: '' });
  assert.equal(huge.cacheStatus().entries, 0);
});

test('GitHub source validation and labels are distinct by repository/revision/root', () => {
  const base = { kind: 'github', repo: 'owner/repo', path: '', ref: 'main' };
  assert.equal(parseSource(base).kind, 'github');
  assert.notEqual(githubLabel(base), githubLabel({ ...base, ref: 'other' }));
  for (const values of [{ repo: 'https://evil.test/repo' }, { path: '../secret' }, { path: '/absolute' }, { commit: 'not-a-commit' }, { ref: '\n' }]) assert.throws(() => githubSource({ ...base, ...values }));
});

test('saved GitHub entries can be removed offline without changing active source or touching credentials', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ageval-github-'));
  const file = join(dir, 'config.json');
  const source = { kind: 'github', repo: 'owner/private', ref: 'main', path: 'datasets', commit: 'b'.repeat(40) };
  await writeFile(file, JSON.stringify({ version: 2, source, recent: [source] }));
  const state = await sourceState(file); await state.removeSaved({ ...source, commit: 'c'.repeat(40) });
  assert.deepEqual(state.current().recent, []); assert.deepEqual(state.current().source, source);
  assert.equal((await sourceState(file)).current().recent.length, 0);
  const contents = await readFile(file, 'utf8'); assert.equal(/token|password/i.test(contents), false);
});
