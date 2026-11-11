import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function client() {
  let plugin;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (initial) => [initial, () => {}],
    useRef: (initial) => ({ current: initial }),
  };
  const window = {
    __ModuleLoader__: {
      load({ factory }) {
        plugin = factory((id) => (id === 'react' ? react : {}));
      },
    },
  };
  const document = {
    getSelection: () => null,
    createElement: () => ({ remove() {} }),
    head: { appendChild() {} },
  };
  const bundle = await readFile(new URL('../client.js', import.meta.url), 'utf8');
  vm.runInNewContext(
    bundle.replace('return module.exports.default ?? module.exports;', 'return module.exports;'),
    { window, document },
  );
  return plugin;
}

test('selection actions extend the native quote surface and retain quoting on non-assistant selections', async () => {
  const plugin = await client();
  const registrations = [];
  const ctx = {
    effect: (register) => register(),
    sidebarRightTabs: { register() {} },
    slots: {
      inject: (_slot, register) => register(),
      register: (options, render) => registrations.push({ options, render }),
    },
    uiConversation: { interactions: { register() {} } },
  };
  plugin.apply(ctx);
  const quoteSurface = registrations.find(({ options }) => options.key === 'quote');
  assert.equal(quoteSurface.options.name, 'conversation.chat.text-interaction');
  // DSH resolves keyed slots in ascending priority; this must precede the stock consumer.
  assert.ok(quoteSurface.options.priority < 0);
  assert.ok(registrations.some(({ options }) => options.key === 'fstack-panel'));

  const calls = [];
  const tree = plugin.SelectionActions({
    ctx,
    sessionId: 'session-a',
    readText: () => 'selected text',
    clearSelection: () => calls.push('clear'),
    dismiss: () => calls.push('dismiss'),
    inputActions: { insertQuote: (text) => calls.push(text) },
  });
  const actions = tree.children.filter((node) => node && typeof node === 'object');
  assert.equal(
    actions.some((node) => node.children.includes('加入摘录')),
    false,
  );
  assert.equal(
    actions.some((node) => node.children.includes('加入 Todo')),
    false,
  );
  const quote = actions.find((node) => node.children.includes('引用文本'));
  quote.props.onClick();
  assert.deepEqual(calls, ['selected text', 'clear', 'dismiss']);
});
