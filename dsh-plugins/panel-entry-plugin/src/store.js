import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export class PanelError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function text(value, field, limit) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) {
    throw new PanelError(`${field}需要填写内容，最多 ${limit} 字`);
  }
  return value.trim();
}

function personalNote(value) {
  if (typeof value !== 'string' || value.length > 10000) {
    throw new PanelError('个人笔记最多 10000 字');
  }
  return value.trim();
}

function sourceOf(value) {
  if (!value || typeof value !== 'object') throw new PanelError('缺少来源消息');
  const source = {
    sessionId: text(value.sessionId, '会话 ID', 512),
    nodeKey: text(value.nodeKey, '消息位置', 512),
    messageId: text(value.messageId, '消息 ID', 512),
    sessionTitle: text(value.sessionTitle || value.sessionId, '会话标题', 1000),
  };
  for (const key of ['seq', 'turn']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw new PanelError('消息位置无效');
    source[key] = value[key];
  }
  return source;
}

function validate(state) {
  if (state?.version !== 1 || !Array.isArray(state.clips) || !Array.isArray(state.todos)) {
    throw new Error('Unsupported panel data');
  }
  for (const [kind, rows] of [
    ['clip', state.clips],
    ['todo', state.todos],
  ]) {
    const ids = new Set();
    for (const row of rows) {
      text(row.id, 'ID', 512);
      if (ids.has(row.id)) throw new Error('Duplicate ID');
      ids.add(row.id);
      text(row.createdAt, '创建时间', 100);
      if (kind === 'clip') {
        text(row.text, '摘录', 50000);
        sourceOf(row.source);
        if (row.note !== undefined) personalNote(row.note);
      } else {
        text(row.text, '待办', 10000);
        if (typeof row.done !== 'boolean') throw new Error('Invalid todo status');
        if (row.source) sourceOf(row.source);
      }
    }
  }
  return state;
}

function sameSource(a, b) {
  return a?.sessionId === b?.sessionId && a?.messageId === b?.messageId;
}

function applyAction(state, action) {
  if (!action || typeof action !== 'object') throw new PanelError('缺少操作');
  const now = new Date().toISOString();
  if (action.type === 'clip.add') {
    const value = text(action.text, '摘录', 50000);
    const source = sourceOf(action.source);
    if (!state.clips.some((row) => row.text === value && sameSource(row.source, source))) {
      state.clips.unshift({ id: randomUUID(), text: value, source, createdAt: now });
    }
  } else if (action.type === 'clip.note') {
    const row = state.clips.find((item) => item.id === action.id);
    if (!row) throw new PanelError('摘录已删除，请刷新', 404);
    const note = personalNote(action.note);
    if (note) row.note = note;
    else delete row.note;
    row.updatedAt = now;
  } else if (action.type === 'todo.add') {
    const clip = action.clipId ? state.clips.find((row) => row.id === action.clipId) : undefined;
    if (action.clipId && !clip) throw new PanelError('摘录已删除，请刷新', 404);
    if (clip && state.todos.some((row) => row.clipId === clip.id)) return state;
    state.todos.unshift({
      id: randomUUID(),
      text: text(action.text ?? clip?.text, '待办', 10000),
      done: false,
      createdAt: now,
      updatedAt: now,
      ...(clip
        ? { clipId: clip.id, source: clip.source }
        : action.source
          ? { source: sourceOf(action.source) }
          : {}),
    });
  } else if (action.type === 'todo.update') {
    const row = state.todos.find((item) => item.id === action.id);
    if (!row) throw new PanelError('待办已删除，请刷新', 404);
    if (action.text !== undefined) row.text = text(action.text, '待办', 10000);
    if (action.done !== undefined) {
      if (typeof action.done !== 'boolean') throw new PanelError('待办状态无效');
      row.done = action.done;
    }
    row.updatedAt = now;
  } else if (action.type === 'clip.remove' || action.type === 'todo.remove') {
    const key = action.type === 'clip.remove' ? 'clips' : 'todos';
    state[key] = state[key].filter((row) => row.id !== action.id);
  } else throw new PanelError('未知面板操作');
  return state;
}

/** One queue per workspace prevents two open sessions from overwriting each other's edits. */
export function panelStore() {
  const pending = new Map();
  const pathOf = (cwd) => join(resolve(cwd), '.dsh', 'panel.json');
  async function load(cwd) {
    try {
      return validate(JSON.parse(await readFile(pathOf(cwd), 'utf8')));
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, clips: [], todos: [] };
      if (error.code) throw error;
      throw new PanelError('.dsh/panel.json 格式无效，原文件已保留；请修复后刷新', 409);
    }
  }
  return {
    async read(cwd) {
      await pending.get(pathOf(cwd))?.catch(() => {});
      return load(cwd);
    },
    act(cwd, action) {
      const path = pathOf(cwd);
      const work = (pending.get(path) ?? Promise.resolve())
        .catch(() => {})
        .then(async () => {
          const state = applyAction(await load(cwd), action);
          await mkdir(dirname(path), { recursive: true });
          const temp = `${path}.${randomUUID()}.tmp`;
          try {
            await writeFile(temp, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
            await rename(temp, path);
          } finally {
            await rm(temp, { force: true });
          }
          return state;
        });
      pending.set(path, work);
      const clean = () => {
        if (pending.get(path) === work) pending.delete(path);
      };
      work.then(clean, clean);
      return work;
    },
  };
}
