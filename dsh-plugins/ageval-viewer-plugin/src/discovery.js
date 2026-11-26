import { constants } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { EvidenceError, rootPath } from './evidence.js';
import { remoteRead } from './remote.js';

const MAX_DATASETS = 500, MAX_SUITES = 2000, MAX_ENTRIES = 20000;
const MAX_DOCUMENT = 16 * 1024 * 1024, MAX_BASELINE_BYTES = 128 * 1024 * 1024;
export const terminalStatus = status => ['complete', 'failed', 'error', 'cancelled', 'canceled', 'interrupted'].includes(status);
const missing = error => error.code === 'ENOENT';
const entryName = name => !name.startsWith('.') && !/[/\\\x00]/u.test(name);
async function isRealDirectory(path) {
  return (await lstat(path).catch(error => { if (!missing(error)) throw error; }))?.isDirectory() ?? false;
}

export async function discoverLocal(path, scope, baseline) {
  const root = await rootPath(path), datasets = [], candidates = [];
  let scanned = 0, bytes = 0;
  const assertReal = async directory => {
    if (await realpath(directory) !== directory) throw new EvidenceError('Suite metadata path changed', 409);
  };
  const usable = async function* (directory) {
    await assertReal(directory);
    const handle = await opendir(directory);
    for await (const entry of handle) {
      if (++scanned > MAX_ENTRIES) throw new EvidenceError('Too many directory entries; choose a narrower directory', 413);
      if (entry.isDirectory() && entryName(entry.name)) yield entry.name;
    }
  };
  async function classify(dir) {
    try { await assertReal(dir); } catch (error) { if (missing(error)) return false; throw error; }
    for (const name of ['summary.json', 'progress.json']) {
      const file = join(dir, name);
      const info = await lstat(file).catch(error => { if (!missing(error)) throw error; });
      if (!info?.isFile()) continue;
      const handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW).catch(error => { if (!missing(error)) throw error; });
      if (!handle) continue;
      try {
        const current = await handle.stat();
        if (!current.isFile()) continue;
        if (current.size > MAX_DOCUMENT || (bytes += current.size) > MAX_BASELINE_BYTES) throw new EvidenceError('Baseline metadata exceeds read limit; choose a narrower directory', 413);
        const buffer = Buffer.alloc(current.size);
        let offset = 0;
        while (offset < buffer.length) {
          const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
          if (!bytesRead) break;
          offset += bytesRead;
        }
        try { const value = JSON.parse(buffer.subarray(0, offset).toString('utf8')); if (typeof value?.status === 'string' && value.status) return terminalStatus(value.status); }
        catch { /* A concurrently written document can be incomplete; try progress. */ }
      } finally { await handle.close(); }
    }
    return false;
  }
  async function scan(dataset, directory) {
    const meta = join(directory, '.ageval'), suites = join(meta, 'suite-runs');
    const hasSuites = await isRealDirectory(meta) && await isRealDirectory(suites);
    if (!hasSuites && dataset !== '.') {
      const manifest = await lstat(join(directory, 'ageval.yaml')).catch(error => { if (!missing(error)) throw error; });
      if (!manifest?.isFile()) return;
    }
    if (datasets.length === MAX_DATASETS) throw new EvidenceError('Too many datasets; choose a narrower directory', 413);
    datasets.push(dataset);
    if (!hasSuites) return;
    for await (const suite of usable(suites)) {
      if (candidates.length === MAX_SUITES) throw new EvidenceError('Too many suite runs to scan; choose a narrower directory', 413);
      candidates.push({ dataset, suite, terminal: baseline && await classify(join(suites, suite)) });
    }
  }
  if (scope === 'dataset') await scan('.', root);
  else for await (const dataset of usable(root)) await scan(dataset, join(root, dataset));
  return { path: root, datasets: datasets.sort(), candidates };
}

export function discoverDirectory(source, scope, baseline, { signal } = {}) {
  if (!['dataset', 'parent'].includes(scope)) throw new EvidenceError('Choose dataset or parent directory scope');
  if (source.kind === 'ssh') return remoteRead(source.host, { op: 'tracking_discover', path: source.path, scope, baseline }, { signal });
  if (source.kind === 'local') return discoverLocal(source.path, scope, baseline);
  throw new EvidenceError('Directory tracking supports local and SSH sources');
}
