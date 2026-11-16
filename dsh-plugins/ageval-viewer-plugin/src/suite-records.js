import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, realpath, rename } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { EvidenceError, readBounded, rootPath, segment, within } from './evidence.js';

// This module only moves suite registrations. Shared attempts are never moved.
export async function inspectSuiteRecord(root, dataset, suite) {
  root = await rootPath(root);
  if (dataset !== '.') segment(dataset); segment(suite);
  const target = resolve(root, dataset, '.ageval', 'suite-runs', suite);
  // Reject every symlink component, including links pointing inside the root.
  let path = root;
  for (const part of target.slice(root.length + 1).split(sep)) {
    path = join(path, part);
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new EvidenceError('Suite path must contain real directories only', 403);
  }
  if (await within(root, target) !== target) throw new EvidenceError('Suite path changed', 409);
  const dir = await lstat(target);
  const documents = [];
  let status = '';
  for (const name of ['summary.json', 'progress.json']) {
    const file = join(target, name);
    try {
      const info = await lstat(file);
      if (info.isSymbolicLink() || !info.isFile()) throw new EvidenceError('Suite evidence must be a regular file, not a symlink', 403);
      const value = await readBounded(root, file);
      const data = JSON.parse(value.text);
      if (!status) status = data.status || '';
      documents.push([name, value.text]);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  // Never infer process liveness; refuse nonterminal/unknown recorded states.
  if (!['complete', 'failed', 'error', 'cancelled', 'canceled', 'interrupted'].includes(status)) throw new EvidenceError('Only terminal suite records can be removed; running or unknown status is protected', 409);
  const fingerprint = createHash('sha256').update(JSON.stringify([target, dir.dev, dir.ino, dir.mtimeMs, dir.ctimeMs, documents])).digest('hex');
  return { dataset, suite, path: target, status, fingerprint };
}
export async function recycleSuiteRecord(root, expected) {
  const current = await inspectSuiteRecord(root, expected.dataset, expected.suite);
  if (current.path !== expected.path || current.fingerprint !== expected.fingerprint) throw new EvidenceError('Suite changed after confirmation; preview again', 409);
  const trash = resolve(dirname(dirname(current.path)), 'suite-run-trash');
  try {
    const info = await lstat(trash);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new EvidenceError('Recycle path must be a real directory', 403);
  } catch (error) { if (error.code !== 'ENOENT') throw error; await mkdir(trash, { mode: 0o700 }); }
  if (await realpath(trash) !== trash) throw new EvidenceError('Recycle path changed', 409);
  const destination = join(trash, `${current.suite}-${randomUUID()}`);
  // Recheck exact source immediately before moving; no recursive deletion.
  const checked = await inspectSuiteRecord(root, expected.dataset, expected.suite);
  if (checked.fingerprint !== expected.fingerprint) throw new EvidenceError('Suite changed after confirmation; preview again', 409);
  await rename(current.path, destination);
  return { dataset: current.dataset, suite: current.suite, from: current.path, to: destination };
}

export function suiteRemovalService({ inspect, recycle, now = Date.now }) {
  const plans = new Map();
  return {
    async preview(source, selections, scope) {
      if (!['local', 'ssh'].includes(source.kind)) throw new EvidenceError('GitHub sources are read-only', 403);
      if (!Array.isArray(selections) || !selections.length || selections.length > 24) throw new EvidenceError('Select 1–24 suite records');
      const items = [], seen = new Set();
      for (const item of selections) {
        if (item?.dataset !== '.') segment(item?.dataset); segment(item?.suite);
        const key = `${item.dataset}/${item.suite}`;
        if (seen.has(key)) continue; seen.add(key);
        items.push(await inspect(source, item.dataset, item.suite));
      }
      for (const [key, value] of plans) if (value.expiresAt <= now()) plans.delete(key);
      if (plans.size >= 32) plans.delete(plans.keys().next().value);
      const token = randomUUID(), expiresAt = now() + 120000;
      plans.set(token, { source: structuredClone(source), scope, items, expiresAt });
      return { token, expiresAt, source, items, effect: 'Move only suite-run directories into .ageval/suite-run-trash; keep shared attempts, task files and tracking history.' };
    },
    async confirm(source, token, scope) {
      const plan = plans.get(token);
      if (!plan || plan.expiresAt <= now() || plan.scope !== scope || JSON.stringify(plan.source) !== JSON.stringify(source)) throw new EvidenceError('Removal preview expired or source changed; preview again', 409);
      plans.delete(token); // one-use, even on partial failure
      const removed = [], errors = [];
      for (const item of plan.items) {
        try { removed.push(await recycle(source, item)); }
        catch (error) { errors.push({ dataset: item.dataset, suite: item.suite, error: error.message }); }
      }
      return { removed, errors };
    },
  };
}
