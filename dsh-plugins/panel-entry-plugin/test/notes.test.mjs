import test from 'node:test';
import assert from 'node:assert/strict';
import { notesEditor, notesInfo, observeNotesEditor } from '../src/notes.js';

test('notes reuse the registered editor without opening or creating a native tab', () => {
  const entry = { options: { key: 'registered-editor' }, component() {} };
  const calls = [];
  const ctx = {
    sidebarRightTabs: {
      get: () => ({ id: 'registered-editor' }),
      subscribe: () => () => calls.push('tabs disposed'),
    },
    slots: { entriesOfSlot: () => [entry], subscribe: () => () => calls.push('slots disposed') },
    sidebarRight: {
      openTab: () => assert.fail('must not open a tab'),
      openResource: () => assert.fail('must not open a resource'),
    },
  };
  assert.equal(notesEditor(ctx), entry);
  const dispose = observeNotesEditor(ctx, () => {});
  dispose();
  assert.deepEqual(calls, ['slots disposed', 'tabs disposed']);
  const signal = new AbortController().signal;
  const actions = { close() {} };
  const panel = {
    panel: { id: 'pane-1' },
    tab: { id: 'panel-tab', kind: 'fstack-panel', visible: true, signal, actions },
  };
  const note = notesInfo(panel, 'source-session', true);
  assert.equal(note.tab.id, panel.tab.id);
  assert.equal(note.tab.kind, 'editor');
  assert.equal(note.tab.contentId, 'dsh-resource://file/session/source-session/NOTES.md');
  assert.equal(note.tab.actions, actions);
  assert.equal(note.tab.signal, signal);
  assert.equal(notesInfo(panel, 'source-session', false).tab.visible, false);
  assert.equal(panel.tab.kind, 'fstack-panel');
});
