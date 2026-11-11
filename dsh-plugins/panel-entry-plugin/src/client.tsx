import {
  createElement as h,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Button,
  Checkbox,
  IconRightUpOutlineRegular,
  IconSearchOutlineRegular,
  IconTrashOutlineRegular,
  Input,
  SegmentedControl,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { get, revealSource, selectionSource } from './navigation.js';
import { notesEditor, notesInfo, observeNotesEditor } from './notes.js';

const TAB = 'fstack-panel';
const API = '/dsh-panel-entry';
const CSS = '__PANEL_CSS__';
const EMPTY = { version: 1, clips: [], todos: [] };
const NO_ROWS = { byId: {} };
const noopSubscribe = () => () => {};
const emptySnapshot = () => NO_ROWS;
type Section = 'clips' | 'todos' | 'notes';
type Source = {
  sessionId: string;
  sessionTitle: string;
  nodeKey: string;
  messageId: string;
  seq: number;
  turn: number;
};
type Clip = { id: string; text: string; source: Source; createdAt: string; note?: string };
type Todo = {
  id: string;
  text: string;
  source?: Source;
  clipId?: string;
  done: boolean;
  createdAt: string;
};
type State = { version: number; clips: Clip[]; todos: Todo[] };
type Change = { cwd: string; section?: Section; focusId?: string };

// Plugin-local notifications keep existing Panel tabs in sync after a selection action.
const listeners = new Set<(change: Change) => void>();
const lastSection = new Map<string, Section>();
function publish(change: Change) {
  for (const listener of listeners) listener(change);
}
function workspace(ctx: any, sessionId: string) {
  return get(ctx, 'sessions')?.list.getSnapshot().byId[sessionId]?.cwd;
}

async function request(cwd: string, path: string, action?: any) {
  if (!cwd) throw new Error('当前会话没有工作区目录');
  const response = await fetch(`${API}/${path}?cwd=${encodeURIComponent(cwd)}`, {
    credentials: 'same-origin',
    ...(action === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-panel-action': '1' },
          body: JSON.stringify(action),
        }),
  });
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(body.message || `请求失败 (${response.status})`);
  return body;
}

function Action({ children, onClick, disabled, label }: any) {
  return h(
    Button,
    { size: 'sm', variant: 'ghost', onClick, disabled, 'aria-label': label },
    children,
  );
}

function ActionIcon({ icon, label, onClick, disabled }: any) {
  return h(
    Tooltip,
    { label, side: 'top', portal: true },
    h(
      Button,
      {
        size: 'sm',
        variant: 'ghost',
        className: 'panel-action-icon',
        'aria-label': label,
        disabled,
        onClick,
      },
      h(icon, { width: 16, height: 16, 'aria-hidden': true }),
    ),
  );
}

function ErrorMessage({ message }: { message: string }) {
  return message ? h('div', { className: 'panel-error', role: 'alert' }, message) : null;
}

function NotesBody({ ctx, sessionId, cwd, tabInfo, panelProps, visible }: any) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const entry = useSyncExternalStore(
    (listener) => observeNotesEditor(ctx, listener),
    () => notesEditor(ctx),
  );
  const info = useMemo(() => notesInfo(tabInfo, sessionId, visible), [tabInfo, sessionId, visible]);
  const useFileInfo = useMemo(() => () => info, [info]);
  const injected = useMemo(() => entry?.inject?.(sessionId) ?? {}, [entry, sessionId]);
  useEffect(() => {
    let active = true;
    request(cwd, 'ensure', {}).then(
      () => active && setReady(true),
      (cause) => active && setError(cause.message),
    );
    return () => {
      active = false;
    };
  }, [cwd]);
  if (error) return h(ErrorMessage, { message: error });
  if (!ready) return h('p', { className: 'panel-empty' }, '读取笔记…');
  if (!entry)
    return h(
      'p',
      { className: 'panel-empty' },
      '请启用 Better Sidebar，以在面板内预览和编辑 Markdown。',
    );
  return h(entry.component, { ...panelProps, ...injected, sessionId, useTabInfo: useFileInfo });
}

function SourceLink({ source, onOpen }: { source: Source; onOpen: () => void }) {
  return h(
    Button,
    {
      size: 'sm',
      variant: 'ghost',
      className: 'panel-source',
      onClick: onOpen,
      title: `${source.sessionTitle} · 第 ${source.turn} 轮`,
      'aria-label': `回到消息：${source.sessionTitle}，第 ${source.turn} 轮`,
    },
    h(IconRightUpOutlineRegular, { width: 14, height: 14, 'aria-hidden': true }),
    h('span', { className: 'panel-source-title' }, source.sessionTitle),
    h('span', null, `第 ${source.turn} 轮`),
  );
}

function ClipDetails({
  row,
  busy,
  mutate,
  onOpen,
  onTodo,
  hasTodo,
}: {
  row: Clip;
  busy: boolean;
  mutate: (action: any) => Promise<boolean>;
  onOpen: () => void;
  onTodo: () => void;
  hasTodo: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  return h(
    'div',
    null,
    (editing || row.note) &&
      h(
        'div',
        { className: 'panel-clip-note' },
        h('span', { className: 'panel-note-label' }, '个人笔记'),
        editing
          ? h(
              'form',
              {
                className: 'panel-edit',
                onSubmit: async (event: any) => {
                  event.preventDefault();
                  if (await mutate({ type: 'clip.note', id: row.id, note: draft }))
                    setEditing(false);
                },
              },
              h('textarea', {
                'aria-label': '摘录的个人笔记',
                placeholder: '补充你的想法、疑问或后续打算…',
                value: draft,
                rows: 3,
                autoFocus: true,
                maxLength: 10000,
                disabled: busy,
                onChange: (event: any) => setDraft(event.target.value),
                onKeyDown: (event: any) => {
                  if (event.key === 'Escape' && !busy) setEditing(false);
                },
              }),
              h(
                'div',
                { className: 'panel-actions' },
                h(
                  Button,
                  { type: 'submit', size: 'sm', variant: 'primary', disabled: busy },
                  busy ? '保存中…' : '保存笔记',
                ),
                h(Action, { disabled: busy, onClick: () => setEditing(false) }, '取消'),
              ),
            )
          : h('p', { className: 'panel-note-text' }, row.note),
      ),
    h(
      'div',
      { className: 'panel-clip-actions' },
      h(
        'div',
        { className: 'panel-actions panel-clip-actions-left' },
        h(
          Action,
          {
            disabled: busy || editing,
            onClick: () => {
              setDraft(row.note || '');
              setEditing(true);
            },
          },
          row.note ? '编辑笔记' : '添加个人笔记',
        ),
        h(
          Action,
          { disabled: busy || hasTodo, onClick: onTodo },
          hasTodo ? '已加入 Todo' : '转为 Todo',
        ),
      ),
      h(
        'div',
        { className: 'panel-actions panel-clip-actions-right' },
        h(ActionIcon, { icon: IconRightUpOutlineRegular, label: '回到消息', onClick: onOpen }),
        h(ActionIcon, {
          icon: IconTrashOutlineRegular,
          label: '删除摘录',
          disabled: busy,
          onClick: () => mutate({ type: 'clip.remove', id: row.id }),
        }),
      ),
    ),
  );
}

function TodoRow({ row, busy, mutate, onOpen }: any) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.text);
  return h(
    'li',
    { className: 'panel-todo', 'data-done': row.done || undefined },
    h(Checkbox, {
      className: 'panel-checkbox',
      checked: row.done,
      disabled: busy,
      label: row.done ? `恢复待办：${row.text}` : `完成待办：${row.text}`,
      onChange: () => mutate({ type: 'todo.update', id: row.id, done: !row.done }),
    }),
    h(
      'div',
      { className: 'panel-todo-body' },
      editing
        ? h(
            'form',
            {
              className: 'panel-edit',
              onSubmit: async (event: any) => {
                event.preventDefault();
                if (await mutate({ type: 'todo.update', id: row.id, text: draft }))
                  setEditing(false);
              },
            },
            h('textarea', {
              'aria-label': '编辑待办',
              value: draft,
              autoFocus: true,
              maxLength: 10000,
              onChange: (event: any) => setDraft(event.target.value),
              onKeyDown: (event: any) => {
                if (event.key === 'Escape') setEditing(false);
              },
            }),
            h(
              'div',
              { className: 'panel-actions' },
              h(
                Button,
                { type: 'submit', size: 'sm', variant: 'primary', disabled: busy || !draft.trim() },
                '保存',
              ),
              h(Action, { onClick: () => setEditing(false), disabled: busy }, '取消'),
            ),
          )
        : h('div', { className: 'panel-todo-text' }, row.text),
      row.source && h(SourceLink, { source: row.source, onOpen }),
      !editing &&
        h(
          'div',
          { className: 'panel-actions' },
          h(
            Action,
            {
              disabled: busy,
              onClick: () => {
                setDraft(row.text);
                setEditing(true);
              },
            },
            '编辑',
          ),
          h(
            Action,
            {
              disabled: busy,
              label: `删除待办：${row.text}`,
              onClick: () => mutate({ type: 'todo.remove', id: row.id }),
            },
            '删除',
          ),
        ),
    ),
  );
}

export function PanelBody({ ctx, ...props }: any) {
  // The host hook is invoked during render, alongside all other hooks.
  const tabInfo = props.useTabInfo?.();
  const list = get(ctx, 'sessions')?.list;
  const rows: any = useSyncExternalStore(
    list?.subscribe ?? noopSubscribe,
    list?.getSnapshot ?? emptySnapshot,
  );
  const sessionId =
    props.sessionId ||
    props.tab?.sessionId ||
    Object.keys(rows.byId).find((id) => rows.byId[id]?.retainedBy?.mainView > 0);
  const cwd = rows.byId[sessionId]?.cwd;
  const [data, setData] = useState<State>(EMPTY);
  const [section, setSection] = useState<Section>(() => lastSection.get(cwd) || 'clips');
  const [notesVisited, setNotesVisited] = useState(section === 'notes');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('open');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [focusId, setFocusId] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const scope = useRef(cwd);
  const mutation = useRef(false);
  const version = useRef(0);
  scope.current = cwd;

  const changeSection = (value: Section) => {
    if (value === 'notes') setNotesVisited(true);
    lastSection.set(cwd, value);
    setSection(value);
  };
  const refresh = async () => {
    const current = cwd;
    const ticket = ++version.current;
    try {
      const result = await request(current, 'state');
      if (scope.current === current && version.current === ticket) {
        setData(result.state);
        setError('');
      }
    } catch (cause: any) {
      if (scope.current === current && version.current === ticket) setError(cause.message);
    } finally {
      if (scope.current === current && version.current === ticket) setLoading(false);
    }
  };

  useEffect(() => {
    setData(EMPTY);
    setLoading(true);
    setQuery('');
    setDraft('');
    setFocusId('');
    setError('');
    setSection(lastSection.get(cwd) || 'clips');
    setNotesVisited(lastSection.get(cwd) === 'notes');
    void refresh();
    const changed = (change: Change) => {
      if (change.cwd !== cwd) return;
      if (change.section) {
        changeSection(change.section);
        setQuery('');
        if (change.section === 'todos') setFilter('open');
      }
      if (change.focusId) setFocusId(change.focusId);
      void refresh();
    };
    listeners.add(changed);
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      listeners.delete(changed);
      window.removeEventListener('focus', onFocus);
      ++version.current;
    };
  }, [cwd]);

  // Reopening a tab refreshes shared data written from another window.
  useEffect(() => {
    if (tabInfo?.tab.visible) void refresh();
  }, [tabInfo?.tab.visible]);
  useEffect(() => {
    if (!focusId) return;
    root.current
      ?.querySelector(`[data-panel-id="${focusId}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [focusId, data, section]);

  const mutate = async (action: any) => {
    if (mutation.current) return false;
    mutation.current = true;
    setBusy(true);
    setError('');
    const current = cwd;
    ++version.current;
    try {
      const result = await request(current, 'action', action);
      if (scope.current === current) {
        setData(result.state);
        publish({ cwd: current });
      }
      return scope.current === current;
    } catch (cause: any) {
      if (scope.current === current) setError(cause.message);
      return false;
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  };
  const openSource = async (source: Source) => {
    setError('');
    try {
      await revealSource(ctx, source, document);
    } catch (cause: any) {
      setError(cause.message);
    }
  };
  const search = query.trim().toLowerCase();
  const matches = (row: Clip | Todo) =>
    `${row.text} ${'note' in row ? row.note || '' : ''} ${row.source?.sessionTitle || ''}`
      .toLowerCase()
      .includes(search);
  const clips = data.clips.filter(matches);
  const todos = data.todos.filter(
    (row) => matches(row) && (filter === 'all' || row.done === (filter === 'done')),
  );
  const openCount = data.todos.filter((row) => !row.done).length;
  return h(
    'div',
    { className: 'fstack-panel', ref: root },
    h(
      'div',
      { className: 'panel-header' },
      h(
        'div',
        { className: 'panel-workspace', title: cwd },
        h('span', { className: 'panel-eyebrow' }, '工作区面板'),
        h('strong', null, cwd?.split(/[\\/]/).filter(Boolean).pop() || '未选择工作区'),
      ),
      h(Action, { label: '刷新面板', disabled: loading || busy, onClick: refresh }, '刷新'),
    ),
    h(
      'div',
      { className: 'panel-navigation' },
      h(SegmentedControl, {
        id: 'fstack-panel-sections',
        label: '面板分区',
        value: section,
        onChange: changeSection,
        options: [
          { value: 'clips', label: `摘录 ${data.clips.length}` },
          { value: 'todos', label: `Todo ${openCount}` },
          { value: 'notes', label: '笔记' },
        ],
      }),
    ),
    h(ErrorMessage, { message: error }),
    section !== 'notes' &&
      h(
        'div',
        { className: 'panel-toolbar' },
        h(Input, {
          icon: h(IconSearchOutlineRegular, { width: 16, height: 16, 'aria-hidden': true }),
          value: query,
          placeholder: section === 'clips' ? '搜索摘录、个人笔记或来源会话' : '搜索待办',
          'aria-label': '搜索面板',
          onChange: (event: any) => setQuery(event.target.value),
        }),
      ),
    section === 'todos' &&
      h(
        'div',
        { className: 'panel-todo-controls' },
        h(
          'form',
          {
            className: 'panel-add',
            onSubmit: async (event: any) => {
              event.preventDefault();
              const current = cwd;
              if ((await mutate({ type: 'todo.add', text: draft })) && scope.current === current) {
                setDraft('');
                setFilter('open');
              }
            },
          },
          h('textarea', {
            value: draft,
            rows: 2,
            maxLength: 10000,
            placeholder: '记一件接下来要做的事…',
            'aria-label': '新待办',
            disabled: busy || loading || !cwd,
            onChange: (event: any) => setDraft(event.target.value),
          }),
          h(
            Button,
            {
              type: 'submit',
              size: 'sm',
              variant: 'primary',
              className: 'panel-submit',
              disabled: busy || loading || !draft.trim() || !cwd,
            },
            '添加待办',
          ),
        ),
        h(SegmentedControl, {
          id: 'fstack-panel-todo-filter',
          label: '待办状态',
          value: filter,
          onChange: setFilter,
          options: [
            { value: 'open', label: `未完成 ${openCount}` },
            { value: 'done', label: `已完成 ${data.todos.length - openCount}` },
            { value: 'all', label: '全部' },
          ],
        }),
      ),
    h(
      'div',
      { className: 'panel-content', 'aria-busy': loading, hidden: section === 'notes' },
      section === 'clips'
        ? loading
          ? h('p', { className: 'panel-empty' }, '读取摘录…')
          : clips.length
            ? h(
                'ol',
                { className: 'panel-clips' },
                clips.map((row) =>
                  h(
                    'li',
                    {
                      key: row.id,
                      className: 'panel-clip',
                      'data-panel-id': row.id,
                      'data-focused': row.id === focusId || undefined,
                    },
                    h(
                      'div',
                      { className: 'panel-clip-meta' },
                      h(SourceLink, { source: row.source, onOpen: () => openSource(row.source) }),
                      h(
                        'time',
                        { dateTime: row.createdAt },
                        new Date(row.createdAt).toLocaleDateString(),
                      ),
                    ),
                    h('blockquote', null, row.text),
                    h(ClipDetails, {
                      row,
                      busy,
                      mutate,
                      hasTodo: data.todos.some((todo) => todo.clipId === row.id),
                      onOpen: () => openSource(row.source),
                      onTodo: async () => {
                        if (
                          await mutate({
                            type: 'todo.add',
                            clipId: row.id,
                            text: row.text.slice(0, 10000),
                          })
                        ) {
                          changeSection('todos');
                          setFilter('open');
                          setQuery('');
                        }
                      },
                    }),
                  ),
                ),
              )
            : h(
                'div',
                { className: 'panel-empty' },
                h('strong', null, search ? '没有匹配的摘录' : '留下值得回看的回复'),
                h(
                  'p',
                  null,
                  search
                    ? '换个关键词试试。'
                    : '在聊天中选中 agent 回复的一段文字，点击「加入摘录」。摘录会保留来源，可随时回到消息。',
                ),
              )
        : section === 'todos'
          ? loading
            ? h('p', { className: 'panel-empty' }, '读取待办…')
            : todos.length
              ? h(
                  'ul',
                  { className: 'panel-todos' },
                  todos.map((row) =>
                    h(TodoRow, {
                      key: row.id,
                      row,
                      busy,
                      mutate,
                      onOpen: () => row.source && openSource(row.source),
                    }),
                  ),
                )
              : h(
                  'div',
                  { className: 'panel-empty' },
                  h(
                    'strong',
                    null,
                    search
                      ? '没有匹配的待办'
                      : filter === 'done'
                        ? '还没有已完成的待办'
                        : filter === 'open' && data.todos.length
                          ? '待办已全部完成'
                          : '接下来要做什么',
                  ),
                  h('p', null, '可以在上方添加，也可以把回复选区或已有摘录加入 Todo。'),
                )
          : null,
    ),
    notesVisited &&
      cwd &&
      tabInfo &&
      h(
        'div',
        { className: 'panel-notes-host', hidden: section !== 'notes' },
        h(NotesBody, {
          key: `${sessionId}:${cwd}`,
          ctx,
          sessionId,
          cwd,
          tabInfo,
          panelProps: props,
          visible: section === 'notes',
        }),
      ),
    h(
      'div',
      { className: 'panel-footer' },
      section === 'notes' ? 'NOTES.md' : '此工作区的所有会话共用',
    ),
  );
}

export function SelectionActions({
  ctx,
  sessionId,
  readText,
  dismiss,
  clearSelection,
  inputActions,
}: any) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const sourceAvailable = selectionSource(ctx, sessionId, document) !== null;
  const quote = () => {
    const text = readText();
    if (text && inputActions?.insertQuote(text)) {
      clearSelection();
      dismiss();
    }
  };
  const save = async (section: Section) => {
    if (lock.current) return;
    const text = readText();
    const source = selectionSource(ctx, sessionId, document);
    if (!text || !source) {
      setError('选区已变化，请重新选中回复');
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const cwd = workspace(ctx, sessionId);
      const result = await request(cwd, 'action', {
        type: section === 'clips' ? 'clip.add' : 'todo.add',
        text,
        source,
      });
      const focusId =
        section === 'clips'
          ? result.state.clips.find(
              (row: Clip) =>
                row.text === text.trim() &&
                row.source.messageId === source.messageId &&
                row.source.sessionId === sessionId,
            )?.id
          : undefined;
      lastSection.set(cwd, section);
      get(ctx, 'sidebarRight').openTab(TAB);
      publish({ cwd, section, focusId });
      clearSelection();
      dismiss();
    } catch (cause: any) {
      setError(cause.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return h(
    'div',
    { className: 'panel-selection', onPointerDown: (event: any) => event.preventDefault() },
    inputActions && h(Action, { disabled: busy, onClick: quote }, '引用文本'),
    sourceAvailable &&
      h(Action, { disabled: busy, onClick: () => save('clips') }, busy ? '保存中…' : '加入摘录'),
    sourceAvailable && h(Action, { disabled: busy, onClick: () => save('todos') }, '加入 Todo'),
    h(Action, { disabled: busy, label: '关闭选区操作', onClick: dismiss }, '关闭'),
    h(ErrorMessage, { message: error }),
  );
}

export const name = 'panel-entry';
export const inject = [
  'slots',
  'sidebarRightTabs',
  'sidebarRight',
  'sessions',
  'uiConversation',
  'uiWorkspace',
];
export function apply(ctx: any) {
  ctx.effect(() => {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    return () => {
      style.remove();
      listeners.clear();
      lastSection.clear();
    };
  }, 'panel-entry: styles');
  ctx.effect(
    () =>
      ctx.sidebarRightTabs.register({
        id: TAB,
        kind: TAB,
        title: () => 'Panel',
        keepMounted: true,
        guide: [
          {
            id: TAB,
            order: 25,
            title: () => 'Panel',
            description: () => '回复摘录、Todo 与面板笔记',
          },
        ],
      }),
    'panel-entry: Panel type',
  );
  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB }, (props: any) =>
          h(PanelBody, { ...props, ctx }),
        ),
      ),
    'panel-entry: body',
  );
  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab.title', () =>
        ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB }, () => 'Panel'),
      ),
    'panel-entry: title',
  );
  ctx.effect(
    () =>
      ctx.uiConversation.interactions.register({
        id: TAB,
        onInteraction(gesture: any) {
          if (
            gesture.hasSelection &&
            gesture.trigger === 'selection' &&
            selectionSource(ctx, gesture.sessionId, document)
          )
            gesture.open();
        },
      }),
    'panel-entry: text selection',
  );
  ctx.effect(
    () =>
      ctx.slots.inject('conversation.chat.text-interaction', () =>
        ctx.slots.register({ name: 'conversation.chat.text-interaction', key: TAB }, (props: any) =>
          h(SelectionActions, { ...props, ctx }),
        ),
      ),
    'panel-entry: selection actions',
  );
  // The stock Quote consumer claims writable selections first. Extend its public
  // keyed surface while preserving insertQuote; the fallback above serves read-only sessions.
  ctx.effect(
    () =>
      ctx.slots.inject('conversation.chat.text-interaction', () =>
        ctx.slots.register(
          { name: 'conversation.chat.text-interaction', key: 'quote', priority: -100 },
          (props: any) => h(SelectionActions, { ...props, ctx }),
        ),
      ),
    'panel-entry: quote actions',
  );
}

export default { name, inject, apply };
