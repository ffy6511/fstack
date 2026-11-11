import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { dataPaths, dshHome, legacyPaths, migrateLegacyFiles } from '../src/paths.js';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('DSH_HOME wins over the default home', () => {
  assert.equal(dshHome({ DSH_HOME: '/tmp/custom' }), '/tmp/custom');
  assert.equal(dshHome({ DSH_HOME: '  /tmp/padded  ' }), '/tmp/padded');
});

test('a blank or missing DSH_HOME falls back to ~/.dsh, never the cwd', () => {
  const home = dshHome({});
  assert.ok(home.endsWith('/.dsh'), home);
  assert.equal(dshHome({ DSH_HOME: '' }), home);
  assert.equal(dshHome({ DSH_HOME: '   ' }), home);
});

test('data paths sit under the harness home, not the XDG folders', () => {
  const paths = dataPaths({ DSH_HOME: '/tmp/dsh-home' });
  assert.equal(paths.dir, '/tmp/dsh-home/ageval-viewer');
  assert.equal(paths.config, '/tmp/dsh-home/ageval-viewer/config.json');
  assert.equal(paths.tracking, '/tmp/dsh-home/ageval-viewer/tracking.json');
});

test('legacy paths stay where 0.1.0 wrote them', () => {
  const old = legacyPaths('/Users/example');
  assert.equal(old.config, '/Users/example/.config/fstack/ageval-viewer.json');
  assert.equal(old.tracking, '/Users/example/.local/share/fstack/ageval-viewer/tracking.json');
});

test('legacy files move once and are not overwritten by an existing destination', async () => {
  const home = await mkdtemp(join(tmpdir(), 'ageval-home-'));
  const dshDir = join(home, 'dsh');
  const old = legacyPaths(home);
  await mkdir(join(home, '.config', 'fstack'), { recursive: true });
  await mkdir(join(home, '.local', 'share', 'fstack', 'ageval-viewer'), { recursive: true });
  await writeFile(old.config, '{"source":null}\n');
  await writeFile(old.tracking, '{"registrations":[]}\n');

  const moved = migrateLegacyFiles({ DSH_HOME: dshDir }, home);
  assert.deepEqual(moved.map(entry => entry.key).sort(), ['config', 'tracking']);
  const next = dataPaths({ DSH_HOME: dshDir });
  assert.equal(await readFile(next.config, 'utf8'), '{"source":null}\n');
  assert.equal(await readFile(next.tracking, 'utf8'), '{"registrations":[]}\n');
  assert.equal(await exists(old.config), false);

  // A destination that already exists wins; the old copy is left alone.
  await writeFile(old.config, '{"stale":true}\n');
  const again = migrateLegacyFiles({ DSH_HOME: dshDir }, home);
  assert.deepEqual(again, []);
  assert.equal(await readFile(next.config, 'utf8'), '{"source":null}\n');
  assert.equal(await readFile(old.config, 'utf8'), '{"stale":true}\n');
});
