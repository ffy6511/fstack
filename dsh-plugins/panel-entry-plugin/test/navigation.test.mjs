import test from 'node:test';
import assert from 'node:assert/strict';
import { selectionSource, revealSource, fileAddress } from '../src/navigation.js';

function fixture() {
  const node = {
    key: 'assistant:5',
    anchorSeq: 42,
    location: { kind: 'step', turn: { turn: 3 } },
    data: { status: 'settled', finalNode: { messageId: 'message-a' } },
  };
  const calls = [];
  const seat = {
    dataset: {
      chatNodeKey: node.key,
      chatFlowKind: 'assistant-step',
      chatTurn: '3',
      chatGroupPart: 'response',
    },
    parentElement: null,
    hasAttribute: () => false,
    scrollIntoView: (options) => calls.push(['scroll', options]),
    animate: () => calls.push(['highlight']),
  };
  const root = {
    dataset: { conversationSession: 'session-a' },
    getClientRects: () => [{}],
    querySelectorAll: () => [seat],
  };
  const source = { closest: (selector) => (selector === '[data-chat-node-key]' ? seat : root) };
  const text = { nodeType: 3, parentElement: { closest: () => source } };
  const range = { startContainer: text, endContainer: text };
  const selection = { isCollapsed: false, rangeCount: 1, getRangeAt: () => range };
  const document = { getSelection: () => selection, querySelectorAll: () => [root] };
  const chat = {
    order: [node.key],
    nodes: { get: (key) => (key === node.key ? node : undefined) },
  };
  const session = {
    getSnapshot: () => ({ openState: 'open', loadingOlder: false, removed: false }),
    loadThrough: async (seq) => calls.push(['load', seq]),
  };
  const ctx = {
    sessions: {
      list: { getSnapshot: () => ({ byId: { 'session-a': { title: 'Design review' } } }) },
      binding: () => ({ session }),
    },
    uiConversation: {
      binding: () => ({ activate() {}, target: () => ({ getSnapshot: () => chat }) }),
    },
    uiWorkspace: { openSession: (id) => calls.push(['open', id]) },
  };
  return { node, calls, seat, root, source, text, range, selection, document, ctx, session };
}

test('selection records the exact settled reply and rejects other roles, sessions, and cross-message ranges', () => {
  const f = fixture();
  const source = selectionSource(f.ctx, 'session-a', f.document);
  assert.equal(source.messageId, 'message-a');
  assert.equal(source.seq, 42);
  assert.equal(source.turn, 3);
  assert.equal(selectionSource(f.ctx, 'session-b', f.document), null);
  f.seat.dataset.chatFlowKind = 'user';
  assert.equal(selectionSource(f.ctx, 'session-a', f.document), null);
  f.seat.dataset.chatFlowKind = 'assistant-step';
  f.seat.dataset.chatGroupPart = 'reasoning';
  assert.equal(selectionSource(f.ctx, 'session-a', f.document), null);
  f.seat.dataset.chatGroupPart = 'response';
  f.node.data.status = 'running';
  assert.equal(selectionSource(f.ctx, 'session-a', f.document), null);
  f.node.data.status = 'settled';
  f.range.endContainer = { nodeType: 1, closest: () => ({}) };
  assert.equal(selectionSource(f.ctx, 'session-a', f.document), null);
});

test('source navigation opens the original session, loads history and lands on its reply', async (t) => {
  const f = fixture();
  t.mock.method(globalThis, 'setTimeout', (fn) => {
    queueMicrotask(fn);
  });
  const oldRaf = globalThis.requestAnimationFrame,
    oldMedia = globalThis.matchMedia;
  globalThis.requestAnimationFrame = (fn) => queueMicrotask(fn);
  globalThis.matchMedia = () => ({ matches: true });
  t.after(() => {
    globalThis.requestAnimationFrame = oldRaf;
    globalThis.matchMedia = oldMedia;
  });
  const source = selectionSource(f.ctx, 'session-a', f.document);
  await revealSource(f.ctx, source, f.document);
  assert.deepEqual(f.calls.slice(0, 2), [
    ['open', 'session-a'],
    ['load', 42],
  ]);
  assert.equal(f.calls[2][0], 'scroll');
  assert.equal(f.calls[3][0], 'highlight');
  assert.equal(
    fileAddress('session / a'),
    'dsh-resource://file/session/session%20%2F%20a/NOTES.md',
  );
});

test('cold-session navigation waits for open and ongoing history loading before jumping', async (t) => {
  const f = fixture();
  let openState = 'cold';
  let loadingOlder = true;
  f.session.getSnapshot = () => ({ openState, loadingOlder, removed: false });
  f.session.loadThrough = async (seq) => {
    assert.equal(openState, 'open');
    assert.equal(loadingOlder, false);
    f.calls.push(['load', seq]);
  };
  t.mock.method(globalThis, 'setTimeout', (fn) => {
    if (openState === 'cold') openState = 'open';
    else loadingOlder = false;
    queueMicrotask(fn);
  });
  const oldRaf = globalThis.requestAnimationFrame,
    oldMedia = globalThis.matchMedia;
  globalThis.requestAnimationFrame = (fn) => queueMicrotask(fn);
  globalThis.matchMedia = () => ({ matches: true });
  t.after(() => {
    globalThis.requestAnimationFrame = oldRaf;
    globalThis.matchMedia = oldMedia;
  });
  await revealSource(f.ctx, selectionSource(f.ctx, 'session-a', f.document), f.document);
  assert.equal(f.calls[1][0], 'load');
  assert.equal(f.calls[2][0], 'scroll');
});

test('source navigation reports unavailable sessions before trying to load history', async () => {
  const f = fixture();
  const source = selectionSource(f.ctx, 'session-a', f.document);
  f.session.getSnapshot = () => ({ openState: 'error' });
  await assert.rejects(revealSource(f.ctx, source, f.document), /打开来源会话失败/);
  assert.equal(
    f.calls.some(([operation]) => operation === 'load'),
    false,
  );
  f.session.getSnapshot = () => ({ removed: true });
  await assert.rejects(revealSource(f.ctx, source, f.document), /来源会话已移除/);
});
