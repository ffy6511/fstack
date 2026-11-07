/**
 * Contract tests for both halves: the host registers a tool the registry
 * accepts, and the shipped client bundle builds a plugin the browser module
 * loader can load and whose registration lands on the `render_ui` key.
 *
 * The client test stubs `window.__ModuleLoader__` — the exact entry point the
 * web shell calls — so the wrapper, not just the components, is covered.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import React from 'react';

const require = createRequire(import.meta.url);

test('the host registers render_ui and its guidance section', async () => {
  const { apply } = await import('../index.js');
  const registered = [];
  const sections = [];
  apply({
    get: () => undefined,
    inject: () => () => {},
    tools: { register: definition => (registered.push(definition), () => {}) },
    systemPrompt: { section: section => (sections.push(section), () => {}) },
  });

  assert.equal(registered.length, 1);
  const tool = registered[0];
  assert.equal(tool.name, 'render_ui');
  assert.deepEqual(Object.keys(tool.parameters.properties ?? tool.parameters), ['program', 'title']);

  assert.equal(sections.length, 1);
  assert.equal(sections[0].name, 'tool:render_ui');
  assert.ok(sections[0].order >= 100 && sections[0].order < 200, 'tool guidance sits in the tool band');
  assert.match(sections[0].text, /root = Stack/);
  // Every component the renderer draws is taught, or the model cannot write it.
  for (const component of ['Stat', 'Table', 'BarChart', 'Steps', 'Callout']) {
    assert.match(sections[0].text, new RegExp(`\\b${component}\\(`));
  }
});

test('the tool refuses a broken program with actionable reasons', async () => {
  const { apply } = await import('../index.js');
  let tool;
  apply({
    get: () => undefined,
    inject: () => () => {},
    tools: { register: definition => ((tool = definition), () => {}) },
    systemPrompt: { section: () => () => {} },
  });

  const appended = [];
  const agent = { session: { append: (type, data) => appended.push({ type, data }) } };
  const ok = await tool.execute({ program: 'root = Stack([a])\na = Text("ready")', title: 'T' }, { agent });
  assert.match(ok.summary, /Drew a UI block/);
  assert.deepEqual(ok.components, ['Stack', 'Text']);
  // The block is derived from this call, so the tool writes no event of its
  // own: a stored type outside the harness vocabulary would make the session
  // unreadable.
  assert.deepEqual(appended, []);

  await assert.rejects(
    () => Promise.resolve(tool.execute({ program: 'root = Stack([a])\na = Chat("x")' }, {})),
    (error) => /rejected/.test(error.message) && /unknown component "Chat"/.test(error.message),
  );
});

test('the projection folds render_ui calls, and a refused call leaves no block', async () => {
  const { apply } = await import('../index.js');
  const definitions = [];
  apply({
    get: () => undefined,
    inject: (_deps, run) => {
      run({ sessionProjections: { register: definition => (definitions.push(definition), () => {}) } });
      return () => {};
    },
    tools: { register: () => () => {} },
    systemPrompt: { section: () => () => {} },
  });

  assert.equal(definitions.length, 1);
  const projection = definitions[0];
  assert.equal(projection.key, 'openuiBlocks');
  assert.equal(projection.stateVersion, 2);
  // Without a wire block the unit is host-only and the turn-tail entry reads
  // undefined — the client can never see the blocks.
  assert.equal(typeof projection.stateSchema.parse, 'function');
  assert.equal(typeof projection.wire.viewSchema.parse, 'function');
  assert.equal(projection.wire.summary, false);

  const call = (seq, callId, args) => ({
    type: 'tool/call',
    seq,
    time: seq,
    data: { name: 'render_ui', callId, turn: 4, arguments: JSON.stringify(args) },
  });
  const result = (seq, callId, isError) => ({
    type: 'tool/result',
    seq,
    time: seq,
    data: { turn: 4, message: { isError, source: { kind: 'tool', callId } } },
  });

  let state = projection.init();
  state = projection.apply(state, { type: 'turn/start', seq: 0, time: 0, data: { turn: 4 } });
  state = projection.apply(state, call(1, 'c1', { program: 'root = Stack([a])\na = Text("one")', title: 'T' }));
  state = projection.apply(state, result(2, 'c1', false));
  state = projection.apply(state, call(3, 'c2', { program: 'root = Stack([a])\na = Chat("x")' }));
  state = projection.apply(state, result(4, 'c2', true));

  const view = projection.wire.viewSchema.parse(projection.wire.view(state));
  assert.deepEqual(view.blocks.map(block => [block.turn, block.program, block.title]), [
    [4, 'root = Stack([a])\na = Text("one")', 'T'],
  ]);
  // A settled result adds nothing, and unrelated events keep the state object.
  assert.equal(projection.apply(state, result(5, 'c1', false)), state);
  assert.equal(projection.apply(state, { type: 'assistant/message', seq: 6, time: 6, data: {} }), state);
});

test('the shipped bundle loads through the module loader and claims its key', async () => {
  let factory;
  globalThis.window = {
    __ModuleLoader__: {
      load: ({ id, factory: fn }) => {
        assert.equal(id, '@fstack/dsh-openui-blocks');
        factory = fn;
      },
    },
  };
  await import('../client.js');

  const loaded = factory(id => {
    if (id === 'react') return React;
    if (id === 'react/jsx-runtime') return require('react/jsx-runtime');
    throw new Error(`unexpected require ${id}`);
  });

  assert.equal(loaded.name, 'openui-blocks-client');
  assert.deepEqual(loaded.inject, ['slots']);
  assert.equal(typeof loaded.apply, 'function');

  const registrations = [];
  loaded.apply({
    effect: fn => fn(),
    slots: {
      inject: (_name, run) => run(),
      register: (options, component) => {
        registrations.push({ options, component });
        return () => {};
      },
    },
  });

  // The block is a Chat node in flow order; the tool view is the fallback.
  assert.deepEqual(registrations.map(r => `${r.options.name}:${r.options.key ?? r.options.id}`), [
    'conversation.chat.turnTail:@fstack/dsh-openui-blocks',
    'tool.call.toolview:render_ui',
  ]);
  delete globalThis.window;
});
