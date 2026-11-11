export function get(ctx, name) {
  try {
    return typeof ctx?.get === 'function' ? ctx.get(name) : ctx?.[name];
  } catch {
    return undefined;
  }
}

export function chatOf(ctx, sessionId) {
  const bound = get(ctx, 'uiConversation').binding(sessionId);
  bound.activate('chat');
  return bound.target('chat').getSnapshot();
}

/** Read DSH's selected reply without changing the transcript DOM. */
export function selectionSource(ctx, sessionId, document) {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const elementOf = (node) => (node.nodeType === 1 ? node : node.parentElement);
  const source = elementOf(range.startContainer)?.closest('[data-text-interaction-source]');
  if (
    !source ||
    source !== elementOf(range.endContainer)?.closest('[data-text-interaction-source]')
  )
    return null;
  const seat = source.closest('[data-chat-node-key]');
  if (
    !seat ||
    seat.dataset.chatFlowKind !== 'assistant-step' ||
    seat.dataset.chatGroupPart === 'reasoning'
  )
    return null;
  if (source.closest('[data-conversation-session]')?.dataset.conversationSession !== sessionId)
    return null;
  const node = chatOf(ctx, sessionId)?.nodes.get(seat.dataset.chatNodeKey);
  if (node?.data.status !== 'settled' || !node.data.finalNode?.messageId) return null;
  const row = get(ctx, 'sessions').list.getSnapshot().byId[sessionId];
  return {
    sessionId,
    sessionTitle: row?.title || '未命名会话',
    nodeKey: node.key,
    messageId: node.data.finalNode.messageId,
    seq: node.anchorSeq,
    turn: node.location.turn?.turn ?? Number(seat.dataset.chatTurn),
  };
}

function waitFor(read, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    const poll = () => {
      try {
        const result = read();
        if (result) return resolve(result);
      } catch (error) {
        return reject(error);
      }
      if (Date.now() >= deadline)
        return reject(new Error('来源会话已打开，消息未显示；请切到聊天视图后重试'));
      setTimeout(poll, 50);
    };
    poll();
  });
}

/** Open through the host, page history through its Session, then reveal the matching reply seat. */
export async function revealSource(ctx, source, document) {
  get(ctx, 'uiWorkspace').openSession(source.sessionId);
  const sessions = get(ctx, 'sessions');
  const session = await waitFor(() => sessions.binding(source.sessionId)?.session);
  await waitFor(() => {
    const state = session.getSnapshot();
    if (state.removed) throw new Error('来源会话已移除，请恢复会话后重试');
    if (state.openState === 'error') throw new Error('打开来源会话失败，请检查会话状态后重试');
    return state.openState === 'open' && !state.loadingOlder;
  });
  await session.loadThrough(source.seq);
  await waitFor(() => {
    const chat = chatOf(ctx, source.sessionId);
    return chat?.order.some(
      (key) => chat.nodes.get(key)?.data.finalNode?.messageId === source.messageId,
    );
  });
  const seat = await waitFor(() => {
    const roots = [...document.querySelectorAll('[data-conversation-session]')].filter(
      (el) => el.dataset.conversationSession === source.sessionId && el.getClientRects().length > 0,
    );
    const chat = chatOf(ctx, source.sessionId);
    for (const root of roots) {
      for (const el of root.querySelectorAll('[data-chat-node-key]')) {
        const node = chat.nodes.get(el.dataset.chatNodeKey);
        if (
          node?.data.finalNode?.messageId === source.messageId &&
          el.dataset.chatGroupPart !== 'reasoning'
        )
          return el;
      }
    }
    return undefined;
  });
  // DSH's hidden-until-found folds listen for the browser's beforematch event.
  for (let el = seat; el; el = el.parentElement) {
    if (el.hasAttribute('hidden')) el.dispatchEvent(new Event('beforematch', { bubbles: true }));
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  seat.scrollIntoView({ block: 'center', behavior: 'instant' });
  // Highlight the reply without adding classes or markup to host nodes.
  seat.animate?.(
    [
      { backgroundColor: 'var(--dsw-alias-interactive-bg-hover)' },
      { backgroundColor: 'transparent' },
    ],
    { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1400 },
  );
}

export function fileAddress(sessionId) {
  return `dsh-resource://file/session/${encodeURIComponent(sessionId)}/NOTES.md`;
}
