import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHandler } from '../index.js';

test('HTTP flow saves state, enforces mutation methods, and preserves existing notes', async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'panel-route-'));
  const server = createServer(createHandler());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(cwd, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/dsh-panel-entry`;
  const call = (path, body, headers = {}) =>
    fetch(
      `${base}/${path}?cwd=${encodeURIComponent(cwd)}`,
      body === undefined
        ? { headers }
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-panel-action': '1', ...headers },
            body: JSON.stringify(body),
          },
    );
  assert.equal((await call('state')).status, 200);
  let response = await call('action', { type: 'todo.add', text: 'Saved via HTTP' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).state.todos[0].text, 'Saved via HTTP');
  assert.equal((await call('action')).status, 405);
  assert.equal((await call('ensure')).status, 405);
  assert.equal((await call('ensure', {})).status, 200);
  await writeFile(join(cwd, 'NOTES.md'), 'User content');
  await call('ensure', {});
  assert.equal(await readFile(join(cwd, 'NOTES.md'), 'utf8'), 'User content');
  assert.equal(
    (
      await call(
        'action',
        { type: 'todo.add', text: 'blocked' },
        { origin: 'https://unrelated.example' },
      )
    ).status,
    403,
  );
  assert.equal(
    (await call('action', { type: 'todo.add', text: 'blocked' }, { 'x-panel-action': '' })).status,
    403,
  );
  assert.equal((await fetch(`${base}/state?cwd=relative`)).status, 400);
  assert.equal((await call('action', { type: 'todo.add', text: 'x'.repeat(140000) })).status, 413);
});
