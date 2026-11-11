import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { panelStore } from '../src/store.js';

const source = {
  sessionId: 'session-a',
  sessionTitle: 'Design review',
  nodeKey: 'assistant:5',
  messageId: 'message-a',
  seq: 42,
  turn: 3,
};
async function root(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-panel-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return cwd;
}

test('clips persist outside Markdown, deduplicate, and share a workspace across sessions', async (t) => {
  const cwd = await root(t),
    store = panelStore();
  assert.deepEqual(await store.read(cwd), { version: 1, clips: [], todos: [] });
  assert.deepEqual(await readdir(cwd), []);
  const action = { type: 'clip.add', text: 'Keep this reply.\nAnd its second line.', source };
  await store.act(cwd, action);
  await store.act(cwd, action);
  await store.act(cwd, { ...action, source: { ...source, sessionId: 'session-b' } });
  const saved = await panelStore().read(cwd);
  assert.equal(saved.clips.length, 2);
  assert.equal(saved.clips[1].text, action.text);
  assert.deepEqual(saved.clips[1].source, source);
  assert.deepEqual(await readdir(cwd), ['.dsh']);
  assert.deepEqual(await readdir(join(cwd, '.dsh')), ['panel.json']);
});

test('parallel session actions retain all updates and a rejected action does not block later writes', async (t) => {
  const cwd = await root(t),
    store = panelStore();
  await Promise.all(
    Array.from({ length: 20 }, (_, i) => store.act(cwd, { type: 'todo.add', text: `task ${i}` })),
  );
  assert.equal((await store.read(cwd)).todos.length, 20);
  await assert.rejects(store.act(cwd, { type: 'todo.add', text: '' }));
  await store.act(cwd, { type: 'todo.add', text: 'after failure' });
  assert.equal((await store.read(cwd)).todos.length, 21);
});

test('personal notes persist per clip, preserve quoted text and source, and can be edited or cleared', async (t) => {
  const cwd = await root(t),
    store = panelStore();
  const action = { type: 'clip.add', text: 'Original reply', source };
  const original = (await store.act(cwd, action)).clips[0];
  const other = (await store.act(cwd, { ...action, text: 'Another reply' })).clips[0];
  await store.act(cwd, {
    type: 'clip.note',
    id: original.id,
    note: 'My thoughts\nFollow up tomorrow.',
  });
  await store.act(cwd, action);
  const saved = await panelStore().read(cwd);
  const row = saved.clips.find((clip) => clip.id === original.id);
  assert.equal(row.note, 'My thoughts\nFollow up tomorrow.');
  assert.equal(row.text, original.text);
  assert.deepEqual(row.source, source);
  assert.equal(row.createdAt, original.createdAt);
  assert.equal(saved.clips.find((clip) => clip.id === other.id).note, undefined);
  assert.equal(saved.clips.length, 2);
  await store.act(cwd, { type: 'clip.note', id: original.id, note: 'Updated thought' });
  const file = join(cwd, '.dsh/panel.json');
  const baseline = await readFile(file, 'utf8');
  for (const note of [null, 123, 'x'.repeat(10001)]) {
    await assert.rejects(store.act(cwd, { type: 'clip.note', id: original.id, note }), {
      status: 400,
    });
    assert.equal(await readFile(file, 'utf8'), baseline);
  }
  await store.act(cwd, { type: 'clip.note', id: original.id, note: '  \n ' });
  assert.equal(
    (await panelStore().read(cwd)).clips.find((clip) => clip.id === original.id).note,
    undefined,
  );
  assert.deepEqual(await readdir(cwd), ['.dsh']);
  await store.act(cwd, { type: 'clip.remove', id: original.id });
  await assert.rejects(store.act(cwd, { type: 'clip.note', id: original.id, note: 'Gone' }), {
    status: 404,
  });
});

test('todos edit, complete, reopen, and retain source when their clip is removed', async (t) => {
  const cwd = await root(t),
    store = panelStore();
  const clip = (await store.act(cwd, { type: 'clip.add', text: 'Follow up', source })).clips[0];
  const todo = (await store.act(cwd, { type: 'todo.add', clipId: clip.id })).todos[0];
  await store.act(cwd, { type: 'todo.add', clipId: clip.id });
  assert.equal((await store.read(cwd)).todos.length, 1);
  await store.act(cwd, {
    type: 'todo.update',
    id: todo.id,
    text: 'Follow up with details',
    done: true,
  });
  assert.equal((await store.read(cwd)).todos[0].done, true);
  await store.act(cwd, { type: 'todo.update', id: todo.id, done: false });
  await store.act(cwd, { type: 'clip.remove', id: clip.id });
  const saved = await panelStore().read(cwd);
  assert.equal(saved.clips.length, 0);
  assert.equal(saved.todos[0].done, false);
  assert.equal(saved.todos[0].text, 'Follow up with details');
  assert.deepEqual(saved.todos[0].source, source);
  await store.act(cwd, { type: 'todo.remove', id: todo.id });
  assert.equal((await store.read(cwd)).todos.length, 0);
});

test('invalid or unknown-version data stays intact after read and write attempts', async (t) => {
  const cwd = await root(t);
  await mkdir(join(cwd, '.dsh'));
  for (const content of [
    '{bad json',
    '{"version":2,"clips":[],"todos":[]}',
    '{"version":1,"clips":[{}],"todos":[]}',
  ]) {
    const path = join(cwd, '.dsh/panel.json');
    await writeFile(path, content);
    const store = panelStore();
    await assert.rejects(store.read(cwd), { status: 409 });
    await assert.rejects(store.act(cwd, { type: 'todo.add', text: 'do not overwrite' }), {
      status: 409,
    });
    assert.equal(await readFile(path, 'utf8'), content);
  }
});

test('workspace data is isolated and source positions must be durable', async (t) => {
  const a = await root(t),
    b = await root(t),
    store = panelStore();
  await store.act(a, { type: 'todo.add', text: 'only a' });
  assert.equal((await store.read(b)).todos.length, 0);
  await assert.rejects(
    store.act(a, { type: 'clip.add', text: 'bad source', source: { ...source, seq: null } }),
  );
});
