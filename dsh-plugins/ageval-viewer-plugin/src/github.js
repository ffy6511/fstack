import { timingOf } from './display.js';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { EvidenceError, rowOf, detailOf, redact, segment } from './evidence.js';

const exec = promisify(execFile);
const CAP = 1024 * 1024;
const JSON_CAP = 16 * 1024 * 1024;
const ENV = { ...process.env, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat', NO_COLOR: '1' };

// Only allow fixed github.com API paths. gh owns credential lookup and Keychain
// access; no token is read by the browser, returned by these routes or persisted.
export async function githubApi(endpoint, raw = false) {
  if (!/^(?:user(?:\?|$)|repos\/)/.test(endpoint) || /[\r\n]/.test(endpoint) || endpoint.split('/').some(p => p === '..' || p === '.')) throw new EvidenceError('Invalid GitHub API endpoint');
  try {
    const args = ['api', '--hostname', 'github.com', '-H', `Accept: ${raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json'}`, endpoint];
    const { stdout } = await exec('gh', args, { env: ENV, timeout: 30000, maxBuffer: 24 * 1024 * 1024 });
    return raw ? stdout : JSON.parse(stdout);
  } catch (error) {
    const reason = String(error.stderr || '');
    // Public repositories remain usable without gh or a local login. Do not send
    // auth to URLs provided by repository data or follow cross-origin redirects.
    if (error.code === 'ENOENT' || /gh auth login|GH_TOKEN|not logged|authentication token/i.test(reason)) {
      const response = await fetch(`https://api.github.com/${endpoint}`, {
        headers: { Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'User-Agent': 'ageval-viewer' },
        redirect: 'error', signal: AbortSignal.timeout(30000),
      });
      if (response.ok) {
        const reader = response.body.getReader(), chunks = []; let size = 0;
        try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 24 * 1024 * 1024) throw new EvidenceError('GitHub response exceeds limit', 413); chunks.push(value); } }
        finally { await reader.cancel(); }
        const text = Buffer.concat(chunks).toString('utf8'); return raw ? text : JSON.parse(text);
      }
      throw apiError(response.status);
    }
    const match = /HTTP (\d{3})/.exec(reason);
    if (match) throw apiError(Number(match[1]));
    throw new EvidenceError('GitHub request failed. Check GitHub CLI login and network connectivity.', 502);
  }
}
function apiError(status) {
  return new EvidenceError(status === 404 ? 'Repository, revision or file unavailable. Private repositories require an account with access.' : status === 401 ? 'GitHub login expired. Sign in again.' : status === 403 || status === 429 ? 'GitHub access denied or rate limited. Check repository permissions, SSO authorization or API rate limit.' : `GitHub API returned ${status}`, status === 404 ? 404 : status === 401 ? 401 : 502);
}
export function githubAvatarUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'avatars.githubusercontent.com' || url.port || url.username || url.password) return null;
    url.searchParams.set('s', '80'); return url.href;
  } catch { return null; }
}
export async function githubAuthStatus(api = githubApi) {
  try { const user = await api('user'); return { authenticated: true, account: user.login, avatarUrl: githubAvatarUrl(user.avatar_url), method: 'gh', loginAvailable: true }; }
  catch {
    const available = await exec('gh', ['--version'], { timeout: 5000 }).then(() => true, () => false);
    return { authenticated: false, loginAvailable: available, method: available ? 'gh' : 'anonymous' };
  }
}

// Device login is started only by an explicit button click. gh retains credentials
// in its own credential store. Expose only device-code/status fields, never logs.
export function githubLoginManager() {
  let child, timer, state = { status: 'idle' };
  const view = () => ({ ...state });
  return {
    current: view,
    start() {
      if (child) return view();
      state = { status: 'starting', verificationUri: 'https://github.com/login/device' };
      try { child = spawn('gh', ['auth', 'login', '--hostname', 'github.com', '--web', '--git-protocol', 'https', '--skip-ssh-key'], { env: { ...ENV, GH_PROMPT_DISABLED: '0', BROWSER: 'false', GH_BROWSER: 'false' }, stdio: ['pipe', 'pipe', 'pipe'] }); }
      catch { state = { status: 'failed', error: 'GitHub CLI is unavailable. Install gh and retry.' }; return view(); }
      const own = child;
      let buffer = '';
      const parse = chunk => {
        buffer = (buffer + chunk.toString()).slice(-4096);
        const match = /\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/.exec(buffer);
        if (match) state = { status: 'pending', verificationUri: 'https://github.com/login/device', userCode: match[1] };
      };
      own.stdout.on('data', parse); own.stderr.on('data', parse); own.stdin.on('error', () => {});
      own.stdin.end('\n');
      timer = setTimeout(() => { if (child === own) { state = { status: 'expired', error: 'Login timed out; start again.' }; own.kill('SIGTERM'); } }, 10 * 60 * 1000);
      own.on('error', () => { clearTimeout(timer); if (child === own) { child = undefined; state = { status: 'failed', error: 'Could not start gh login. Install GitHub CLI or sign in from a terminal.' }; } });
      own.on('close', code => { clearTimeout(timer); if (child !== own) return; child = undefined; if (state.status === 'expired' || state.status === 'cancelled') return; state = code === 0 ? { status: 'complete' } : { status: 'failed', error: 'GitHub login did not complete. Retry, or run gh auth login --hostname github.com --web in a terminal.' }; });
      return view();
    },
    cancel() { if (child) { state = { status: 'cancelled' }; child.kill('SIGTERM'); } return view(); },
    dispose() { clearTimeout(timer); if (child) { const own = child; child = undefined; own.kill('SIGTERM'); } },
  };
}

export function githubSource(input) {
  if (typeof input.repo !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repo)) throw new EvidenceError('Use a github.com repository as owner/name');
  const path = input.path || '';
  if (typeof path !== 'string' || path.includes('\\') || path.includes('\0') || path.startsWith('/') || path.split('/').some(p => p === '.' || p === '..')) throw new EvidenceError('Use a repository-relative directory without ..');
  const ref = input.ref || 'HEAD';
  if (typeof ref !== 'string' || !ref.trim() || ref.length > 256 || /[\x00-\x1f]/.test(ref)) throw new EvidenceError('Invalid branch, tag or commit');
  const commit = input.commit;
  if (commit != null && !/^[a-f0-9]{40}$/i.test(commit)) throw new EvidenceError('Invalid GitHub commit');
  return { kind: 'github', repo: input.repo, ref, path: path.replace(/\/+$/, ''), ...(commit ? { commit } : {}) };
}
export function githubLabel(input) {
  const s = githubSource(input);
  return `github://${s.repo}?ref=${encodeURIComponent(s.ref)}&path=${encodeURIComponent(s.path)}${s.commit ? `&commit=${s.commit}` : ''}`;
}

// Traverse Git trees one directory at a time (never recursive=1). Directory data
// excludes box/raw/workspaces by construction; blobs are fetched only on demand.
export function githubReader(api = githubApi) {
  const cache = new Map();
  const maxEntries = 256, maxBytes = 16 * 1024 * 1024;
  let cacheBytes = 0, generation = 0;
  function cacheStatus() { return { storage: 'memory', entries: cache.size, bytes: cacheBytes, maxEntries, maxBytes, diskPath: null }; }
  function clearCache() { generation++; cache.clear(); cacheBytes = 0; return cacheStatus(); }
  async function immutable(endpoint) {
    if (cache.has(endpoint)) {
      const entry = cache.get(endpoint); cache.delete(endpoint); cache.set(endpoint, entry); return entry.value;
    }
    const started = generation;
    const value = await api(endpoint);
    const bytes = Buffer.byteLength(JSON.stringify(value));
    // Do not let an in-flight request repopulate a cache the user just cleared.
    if (started === generation && bytes <= maxBytes && !cache.has(endpoint)) {
      while (cache.size >= maxEntries || cacheBytes + bytes > maxBytes) {
        const oldest = cache.keys().next().value; cacheBytes -= cache.get(oldest).bytes; cache.delete(oldest);
      }
      cache.set(endpoint, { value, bytes }); cacheBytes += bytes;
    }
    return value;
  }
  async function snapshot(input) {
    const source = githubSource(input);
    const commit = await api(`repos/${source.repo}/commits/${encodeURIComponent(source.commit || source.ref)}`);
    return { source: { ...source, commit: commit.sha }, tree: commit.commit.tree.sha };
  }
  async function tree(repo, sha) {
    const value = await immutable(`repos/${repo}/git/trees/${sha}`);
    if (value.truncated) throw new EvidenceError('GitHub directory listing is truncated. Select a narrower dataset root.', 413);
    return value.tree;
  }
  async function locate(repo, root, path) {
    let current = { type: 'tree', sha: root };
    for (const name of path.split('/').filter(Boolean)) {
      if (current.type !== 'tree') throw new EvidenceError('GitHub path is not a directory', 404);
      current = (await tree(repo, current.sha)).find(entry => entry.path === name);
      if (!current) throw new EvidenceError('GitHub directory or evidence file not found', 404);
      if (current.mode === '120000' || current.type === 'commit') throw new EvidenceError('Symlinks and submodules are not supported as evidence', 403);
    }
    return current;
  }
  async function root(input) {
    const snap = await snapshot(input);
    const entry = await locate(snap.source.repo, snap.tree, snap.source.path);
    if (entry.type !== 'tree') throw new EvidenceError('Select a directory, not a file');
    return { ...snap, root: entry.sha };
  }
  const join = (...parts) => parts.filter(p => p && p !== '.').join('/');
  async function file(repo, entry, cap) {
    if (entry.type !== 'blob' || entry.mode === '120000') throw new EvidenceError('Evidence is not a regular Git blob', 403);
    if (entry.size > cap) throw new EvidenceError(`Evidence exceeds ${cap} bytes; omitted without downloading`, 413);
    const text = await api(`repos/${repo}/git/blobs/${entry.sha}`, true);
    if (Buffer.byteLength(text) > cap) throw new EvidenceError('Evidence exceeds limit', 413);
    if (text.startsWith('version https://git-lfs.github.com/spec/v1')) throw new EvidenceError('This file is a Git LFS pointer; upload ordinary lightweight evidence files instead', 422);
    return { text: redact(text), bytes: entry.size ?? Buffer.byteLength(text), truncated: false };
  }
  async function optional(repo, rootSha, path, cap = JSON_CAP) {
    try { return await file(repo, await locate(repo, rootSha, path), cap); }
    catch (e) { if (e.status === 404) return null; throw e; }
  }
  async function docs(snap, dataset, suite) {
    if (dataset !== '.') segment(dataset); segment(suite);
    const base = join(dataset, '.ageval', 'suite-runs', suite);
    const summary = await optional(snap.source.repo, snap.root, join(base, 'summary.json'));
    const progress = summary ? null : await optional(snap.source.repo, snap.root, join(base, 'progress.json'));
    if (!summary && !progress) throw new EvidenceError('Suite summary/progress is missing', 404);
    return { summary: summary ? JSON.parse(summary.text) : null, progress: progress ? JSON.parse(progress.text) : null };
  }
  return {
    cacheStatus, clearCache,
    async resolve(source) { return (await root({ ...source, commit: undefined })).source; },
    async list(source) {
      const snap = await root(source);
      const entries = (await tree(snap.source.repo, snap.root)).filter(e => e.type === 'tree').map(e => ({ name: e.path, path: join(snap.source.path, e.path) }));
      return { source: snap.source, path: snap.source.path, entries };
    },
    async suites(source) {
      const snap = await root(source), repo = snap.source.repo;
      let groups;
      try { const direct = await locate(repo, snap.root, '.ageval/suite-runs'); groups = direct.type === 'tree' ? ['.'] : []; }
      catch (e) { if (e.status !== 404) throw e; groups = (await tree(repo, snap.root)).filter(e => e.type === 'tree' && !e.path.startsWith('.')).map(e => e.path); }
      const rows = [], warnings = []; let requests = 0;
      for (const dataset of groups.slice(0, 100)) {
        let suites;
        try { const entry = await locate(repo, snap.root, join(dataset, '.ageval/suite-runs')); suites = await tree(repo, entry.sha); }
        catch (e) { if (e.status === 404) continue; throw e; }
        for (const entry of suites.filter(e => e.type === 'tree')) {
          if (rows.length >= 200 || requests++ >= 200) { warnings.push('GitHub suite scan capped at 200; select an individual bench to narrow the scan'); break; }
          try { const d = await docs(snap, dataset, entry.path); rows.push(rowOf(dataset, entry.path, d.summary, d.progress)); }
          catch (e) { warnings.push(`${dataset}/${entry.path}: ${e.message}`); }
        }
      }
      return { rows, warnings, revision: snap.source.commit };
    },
    async suite(source, dataset, suite) { const snap = await root(source); const d = await docs(snap, dataset, suite); return detailOf(dataset, suite, d.summary, d.progress); },
    async timing(source, dataset, suite, taskId, requestedRun) {
      segment(taskId);
      const snap = await root(source), d = await docs(snap, dataset, suite);
      const task = detailOf(dataset, suite, d.summary, d.progress).tasks.find(t => t.taskId === taskId);
      const runId = requestedRun || task?.runId; segment(runId);
      if (!task?.runIds.includes(runId)) throw new EvidenceError('Attempt does not belong to task', 403);
      let value = await optional(snap.source.repo, snap.root, join(dataset, '.ageval/runs', runId, 'summary.json'), CAP);
      if (!value) value = await optional(snap.source.repo, snap.root, join(dataset, 'tasks', taskId, '.ageval/runs', runId, 'summary.json'), CAP);
      return { ...timingOf(value ? JSON.parse(value.text) : {}), runId };
    },
    async attempt(source, dataset, suite, taskId, requestedRun) {
      segment(taskId);
      const snap = await root(source), repo = snap.source.repo, d = await docs(snap, dataset, suite);
      const task = detailOf(dataset, suite, d.summary, d.progress).tasks.find(t => t.taskId === taskId);
      if (!task) throw new EvidenceError('Task not found', 404);
      const runId = requestedRun || task.runId; segment(runId);
      if (!task.runIds.includes(runId)) throw new EvidenceError('Attempt does not belong to task', 403);
      const files = {}, warnings = [];
      for (const name of ['result.json', 'summary.json', 'trajectory.jsonl', 'evaluation/observation.jsonl', 'evaluation/checks.json']) {
        try {
          let value = await optional(repo, snap.root, join(dataset, '.ageval/runs', runId, name), CAP);
          if (!value) value = await optional(repo, snap.root, join(dataset, 'tasks', taskId, '.ageval/runs', runId, name), CAP);
          if (value) files[name] = value;
        } catch (e) { if (e.status === 413 || e.status === 422) warnings.push(`${name}: ${e.message}`); else throw e; }
      }
      return { dataset, suite, taskId, runId, files, warnings, revision: snap.source.commit };
    },
  };
}
export const github = githubReader();
