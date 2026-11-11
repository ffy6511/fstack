import { spawn, execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve, isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { EvidenceError, redact, rowOf, segment, detailOf } from './evidence.js';

const exec = promisify(execFile);
const MAX_OUTPUT = 24 * 1024 * 1024;
const SSH_CONFIG = resolve(homedir(), '.ssh/config');
let program;
const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
const safeAlias = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,250}$/.test(value);

// Enumerate literal aliases in Include files; OpenSSH remains the authority for
// their effective configuration. Wildcard/negated Host patterns are not endpoints.
export async function configAliases(config = SSH_CONFIG) {
  const found = new Set(), visited = new Set();
  async function visit(file, depth = 0) {
    if (depth > 10 || visited.has(file)) return;
    visited.add(file);
    let text;
    try { text = await readFile(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const line of text.split(/\r?\n/)) {
      const uncommented = line.replace(/("[^"\n]*"|'[^'\n]*')|#.*/g, (all, quoted) => quoted || '');
      const tokens = (uncommented.match(/"[^"\n]*"|'[^'\n]*'|[^\s]+/g) || []).map(t => t.replace(/^["']|["']$/g, ''));
      const key = (tokens.shift() || '').toLowerCase();
      if (key === 'host') for (const token of tokens) if (safeAlias(token)) found.add(token);
      if (key === 'include') for (let pattern of tokens) {
        pattern = pattern.startsWith('~/') ? resolve(homedir(), pattern.slice(2)) : isAbsolute(pattern) ? pattern : resolve(homedir(), '.ssh', pattern);
        if (pattern.includes('*') || pattern.includes('?')) {
          // Expand patterns component by component, with bounded recursion.
          const parts = pattern.split('/').filter(Boolean);
          let paths = ['/'];
          for (const part of parts) {
            const next = [];
            for (const parent of paths) {
              if (!/[?*]/.test(part)) { next.push(resolve(parent, part)); continue; }
              const regex = new RegExp('^' + part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
              for (const item of await readdir(parent).catch(() => [])) if (regex.test(item)) next.push(resolve(parent, item));
            }
            paths = next.slice(0, 100);
          }
          for (const path of paths) await visit(path, depth + 1);
        } else await visit(pattern, depth + 1);
      }
    }
  }
  await visit(config);
  return [...found].sort();
}
export async function assertHost(alias) {
  if (!safeAlias(alias) || !(await configAliases()).includes(alias)) throw new EvidenceError('Choose a configured SSH Host alias', 400);
  return alias;
}
export async function sshHosts() {
  const hosts = [];
  for (const alias of await configAliases()) {
    try {
      const { stdout } = await exec('/usr/bin/ssh', ['-G', '-o', 'PermitLocalCommand=no', alias], { timeout: 5000, maxBuffer: 256 * 1024 });
      const fields = {};
      for (const line of stdout.split(/\r?\n/)) { const [key, ...rest] = line.split(/\s+/); if (!(key in fields)) fields[key] = rest.join(' '); }
      hosts.push({ alias, hostName: fields.hostname, user: fields.user, port: fields.port });
    } catch { hosts.push({ alias }); }
  }
  return hosts;
}
function absolutePath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('\0') || path.length > 4096) throw new EvidenceError('Choose an absolute remote directory');
  return path;
}
export async function remoteRead(host, request, { signal, timeout = 30000 } = {}) {
  await assertHost(host);
  if (request.op !== 'home') absolutePath(request.path);
  program ??= await readFile(new URL('./remote-reader.py', import.meta.url), 'utf8');
  const encoded = Buffer.from(JSON.stringify(request)).toString('base64');
  // Source code comes from this package on stdin. Paths are data in one base64
  // argument, never shell fragments. No deployment or remote file writes.
  const command = `python3 - ${quote(encoded)}`;
  return new Promise((resolvePromise, reject) => {
    const child = spawn('/usr/bin/ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'ControlPath=none', '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=yes', '-o', 'PermitLocalCommand=no', '-o', 'ClearAllForwardings=yes', host, command], { stdio: ['pipe', 'pipe', 'pipe'], signal });
    const output = [], stderr = []; let bytes = 0, overflow = false;
    const timer = setTimeout(() => child.kill('SIGTERM'), timeout);
    child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > MAX_OUTPUT) { overflow = true; child.kill('SIGTERM'); } else output.push(chunk); });
    child.stderr.on('data', chunk => { if (Buffer.concat(stderr).length < 8192) stderr.push(chunk); });
    child.stdin.on('error', () => {});
    child.on('error', error => { clearTimeout(timer); reject(new EvidenceError(`${host}: ${redact(error.message)}`, 502)); });
    child.on('close', (code, stopped) => {
      clearTimeout(timer);
      if (overflow || code !== 0) return reject(new EvidenceError(`${host}: ${overflow ? 'Read exceeds response limit' : stopped ? 'SSH read timed out or canceled' : redact(Buffer.concat(stderr).toString()).slice(0, 700) || 'SSH connection failed'}`, 502));
      try {
        const result = JSON.parse(Buffer.concat(output).toString('utf8'));
        if (!result.ok) throw new EvidenceError(`${host}: ${result.error}`, result.code === 2 ? 404 : 400);
        resolvePromise(JSON.parse(redact(JSON.stringify(result.value))));
      } catch (error) { reject(error instanceof EvidenceError ? error : new EvidenceError(`${host}: Invalid remote response`, 502)); }
    });
    child.stdin.end(program);
  });
}
export async function sshTest(host) { return remoteRead(host, { op: 'home' }); }
export async function sshList(host, path) { return remoteRead(host, { op: 'list_dirs', path }); }
export async function remoteResolve(source) { const result = await remoteRead(source.host, { op: 'resolve', path: source.path }); return { kind: 'ssh', host: source.host, path: result.path }; }
export async function remoteSuites(source) {
  const result = await remoteRead(source.host, { op: 'suites', path: source.path });
  return { rows: result.documents.map(d => rowOf(d.dataset, d.suite, d.summary, d.progress)), warnings: result.warnings };
}
export async function remoteSuite(source, dataset, suite) {
  if (dataset !== '.') segment(dataset); segment(suite);
  const d = await remoteRead(source.host, { op: 'suite', path: source.path, dataset, suite });
  return detailOf(dataset, suite, d.summary, d.progress);
}
export async function remoteAttempt(source, dataset, suite, task, run) {
  if (dataset !== '.') segment(dataset); segment(suite); segment(task); if (run) segment(run);
  return remoteRead(source.host, { op: 'attempt', path: source.path, dataset, suite, task, run }, { timeout: 60000 });
}
export function sourceLabel(source) { return source.kind === 'ssh' ? `ssh://${source.host}${source.path}` : source.path; }
