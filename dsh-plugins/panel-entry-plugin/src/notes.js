import { fileAddress, get } from './navigation.js';

const BODY_SLOT = 'sidebar.right.pane.tab';

/** Reuse the registered editor carrier with its own service, store and file-loading implementation. */
export function notesEditor(ctx) {
  const definition = get(ctx, 'sidebarRightTabs').get('editor');
  if (!definition) return undefined;
  return get(ctx, 'slots')
    .entriesOfSlot(BODY_SLOT)
    .find((entry) => entry.options.key === definition.id);
}

export function observeNotesEditor(ctx, listener) {
  const slots = get(ctx, 'slots').subscribe(BODY_SLOT, listener);
  const tabs = get(ctx, 'sidebarRightTabs').subscribe(listener);
  return () => {
    slots();
    tabs();
  };
}

/** The editor borrows Panel's actual occurrence and lifetime, with NOTES.md as its file identity. */
export function notesInfo(info, sessionId, visible) {
  const address = fileAddress(sessionId);
  return {
    ...info,
    tab: {
      ...info.tab,
      kind: 'editor',
      title: 'NOTES.md',
      contentId: address,
      visible: info.tab.visible && visible,
      navigation: { address, params: undefined, revision: 0 },
    },
  };
}
