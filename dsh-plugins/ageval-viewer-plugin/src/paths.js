// Where this plugin keeps its user data.
//
// DSH's own convention is the harness home: an explicit DSH_HOME wins, else
// ~/.dsh. Data placed there follows the harness — a temporary DSH_HOME used to
// test an install takes the plugin's state with it instead of scattering it
// across the user's XDG folders.
//
// `@deepseek-ai/dsh-home-paths` would resolve this for us, but it is not
// resolvable from a `link:`-installed plugin, so the two-step precedence is
// implemented here. Keep it identical to that package's documented chain.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';

export function dshHome(env = process.env) {
  const configured = typeof env.DSH_HOME === 'string' ? env.DSH_HOME.trim() : '';
  return configured === '' ? join(homedir(), '.dsh') : configured;
}

export function dataPaths(env = process.env) {
  const dir = join(dshHome(env), 'ageval-viewer');
  return { dir, config: join(dir, 'config.json'), tracking: join(dir, 'tracking.json') };
}

// Where 0.1.0 kept them: XDG folders under the repository's name.
export function legacyPaths(home = homedir()) {
  return {
    config: join(home, '.config', 'fstack', 'ageval-viewer.json'),
    tracking: join(home, '.local', 'share', 'fstack', 'ageval-viewer', 'tracking.json'),
  };
}

// Move pre-0.1.1 files into the harness home once. A file already at its new
// path wins; the old copy stays untouched in that case.
export function migrateLegacyFiles(env = process.env, home = homedir()) {
  const next = dataPaths(env);
  const old = legacyPaths(home);
  const moved = [];
  for (const key of ['config', 'tracking']) {
    const from = old[key];
    const to = next[key];
    if (existsSync(to) || !existsSync(from)) continue;
    mkdirSync(dirname(to), { recursive: true, mode: 0o700 });
    try {
      renameSync(from, to);
    } catch {
      copyFileSync(from, to);
      rmSync(from, { force: true });
    }
    moved.push({ key, from, to });
  }
  return moved;
}

// The bootstrap directory never moves: it holds settings.json, which says where
// the rest lives. Keeping it fixed avoids the question of where the pointer is
// stored once the pointer itself points somewhere else.
export function bootstrapDir(env = process.env) {
  return join(dshHome(env), 'ageval-viewer');
}

export function settingsPath(env = process.env) {
  return join(bootstrapDir(env), 'settings.json');
}

// Accepts an absolute path or a bare/current-user tilde; anything else is empty.
export function expandPath(value, home = homedir()) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '') return '';
  if (text === '~') return home;
  if (text.startsWith('~/')) return join(home, text.slice(2));
  return isAbsolute(text) ? text : '';
}

export function readSettings(env = process.env) {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(env), 'utf8'));
    const dataDir = expandPath(raw?.dataDir);
    return dataDir === '' ? {} : { dataDir };
  } catch {
    return {};
  }
}

// Data paths follow settings.json; without one they sit in the bootstrap dir.
export function resolveDataPaths(env = process.env) {
  const dir = readSettings(env).dataDir ?? bootstrapDir(env);
  return { dir, config: join(dir, 'config.json'), tracking: join(dir, 'tracking.json') };
}

// Point the data at `target`, carrying the current files along. The running
// Host keeps its open handles until it restarts, so callers report that.
export function setDataDir(target, env = process.env) {
  const dir = expandPath(target);
  if (dir === '') throw new Error('数据目录必须是绝对路径，或以 ~/ 开头');
  const current = resolveDataPaths(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const moved = [];
  for (const key of ['config', 'tracking']) {
    const from = current[key];
    const to = join(dir, `${key}.json`);
    if (from === to || !existsSync(from) || existsSync(to)) continue;
    try {
      renameSync(from, to);
    } catch {
      copyFileSync(from, to);
      rmSync(from, { force: true });
    }
    moved.push({ key, from, to });
  }
  const file = settingsPath(env);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify({ version: 1, dataDir: dir }, null, 2) + '\n', { mode: 0o600 });
  renameSync(temp, file);
  return { dir, moved };
}
