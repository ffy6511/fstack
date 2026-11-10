/* @fstack/dsh-panel-entry — hand-written, no build step.
 *
 * One right-sidebar guide entry titled "Panel". Opening it mounts a small page
 * that (1) asks the host to make sure NOTES.md exists and (2) hands the file
 * to DSH's sidebar as a `dsh-resource://file/session/<sid>/NOTES.md` address.
 * Whichever tab type claims `.md` renders it (dsh-marktext, or the stock
 * viewer); this plugin draws no document of its own.
 */
window.__ModuleLoader__.load({
  id: '@fstack/dsh-panel-entry',
  factory: (require) => {
    const module = { exports: {} };
    (function (module, exports, require) {
      const React = require('react');
      const h = React.createElement;

      const TAB_ID = 'fstack-panel';
      const FILE = 'NOTES.md';
      const ENSURE_URL = '/dsh-panel-entry/ensure';

      let autoOpened = false;

      const styles = {
        page: {
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          fontSize: '13px',
          lineHeight: 1.6,
        },
        title: { fontWeight: 600, fontSize: '14px' },
        muted: { opacity: 0.7 },
        error: { color: 'var(--dsw-alias-label-error, #c0392b)', wordBreak: 'break-word' },
        button: {
          alignSelf: 'flex-start',
          padding: '5px 14px',
          borderRadius: '6px',
          border: '1px solid currentColor',
          background: 'transparent',
          color: 'inherit',
          fontSize: '13px',
          cursor: 'pointer',
        },
      };

      function get(ctx, name) {
        try {
          return typeof ctx?.get === 'function' ? ctx.get(name) : ctx?.[name];
        } catch {
          return undefined;
        }
      }

      /** `dsh-resource://file/session/<sid>/<path>`, the grammar the host parses. */
      function fileAddress(sessionId, path) {
        const encoded = path
          .split('/')
          .filter((part) => part !== '')
          .map((part) => encodeURIComponent(part))
          .join('/');
        return 'dsh-resource://file/session/' + encodeURIComponent(sessionId) + '/' + encoded;
      }

      /**
       * The session the sidebar is showing: its id and workspace root. Props
       * first, then the session the main view retains — the same rule the
       * host's own open-in-app uses.
       */
      function resolveSession(ctx, props) {
        const sessions = get(ctx, 'sessions');
        const byId = sessions?.list?.getSnapshot?.()?.byId ?? {};
        const candidates = [
          props?.sessionId,
          props?.tab?.sessionId,
          (() => {
            try {
              return typeof props?.useTabInfo === 'function'
                ? props.useTabInfo()?.tab?.sessionId
                : undefined;
            } catch {
              return undefined;
            }
          })(),
        ];
        for (const id of candidates) {
          if (typeof id === 'string' && id !== '') {
            return { sessionId: id, cwd: byId[id]?.cwd };
          }
        }
        for (const [id, row] of Object.entries(byId)) {
          if (row && row.retainedBy && (row.retainedBy.mainView ?? 0) > 0) {
            return { sessionId: id, cwd: row.cwd };
          }
        }
        return undefined;
      }

      /** Ask the host to create the note when it is missing; returns an error string or undefined. */
      async function ensureNote(cwd) {
        if (typeof cwd !== 'string' || cwd === '') return '取不到工作区目录';
        try {
          const url = `${ENSURE_URL}?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(FILE)}`;
          const response = await fetch(url, { credentials: 'same-origin' });
          const body = await response.json().catch(() => ({}));
          if (!response.ok || body?.ok !== true)
            return `建文件失败：${body?.message ?? response.status}`;
          return undefined;
        } catch (cause) {
          return '建文件失败：' + String(cause?.message ?? cause);
        }
      }

      /** Ensure the note, then hand it to the sidebar. Returns an error string or undefined. */
      async function openNote(ctx, props) {
        const session = resolveSession(ctx, props);
        if (session === undefined) return '定位不到当前会话';
        const failure = await ensureNote(session.cwd ?? props?.cwd);
        if (failure !== undefined) return failure;

        const scope = { sessionId: session.sessionId };
        if (session.cwd !== undefined) scope.cwd = session.cwd;

        const better = get(ctx, 'betterSidebar');
        try {
          // dsh-better-sidebar first: its openFile is the supported way into
          // its own editor tab, the one with the conflict banner. Without it
          // the address goes through DSH's native sidebar, which hands `.md`
          // to whichever tab type claims it (dsh-marktext, stock viewer).
          if (better && typeof better.openFile === 'function') {
            better.openFile(scope, FILE, 'Panel');
            return undefined;
          }
          const sidebar = get(ctx, 'sidebarRight');
          if (!sidebar || typeof sidebar.openResource !== 'function')
            return 'sidebarRight 服务不可用';
          sidebar.openResource(fileAddress(session.sessionId, FILE));
          return undefined;
        } catch (cause) {
          return '打开失败：' + String(cause?.message ?? cause);
        }
      }

      /**
       * The tab body. Built from the plugin's own ctx: a native slot may hand
       * the component props without `ctx`, and closing over it here keeps the
       * panel renderable either way.
       */
      function makeBody(ctx) {
        return function PanelBody(props) {
          const [error, setError] = React.useState(undefined);
          const ran = React.useRef(false);

          React.useEffect(() => {
            if (ran.current || autoOpened) return;
            ran.current = true;
            autoOpened = true;
            let alive = true;
            void openNote(ctx, props).then((failure) => {
              if (alive) setError(failure);
            });
            return () => {
              alive = false;
            };
          }, []);

          return h(
            'div',
            { style: styles.page },
            h('div', { style: styles.title }, FILE),
            h(
              'div',
              { style: styles.muted },
              '约定好的面板笔记。agent 按 panel-note 规范往这里追加，你在右栏直接改同一份文件。',
            ),
            error === undefined ? null : h('div', { style: styles.error }, error),
            h(
              'button',
              {
                type: 'button',
                style: styles.button,
                onClick: () => {
                  void openNote(ctx, props).then(setError);
                },
              },
              '重新打开',
            ),
          );
        };
      }

      function PanelTitle() {
        return 'Panel';
      }

      var name = 'panel-entry';
      var inject = ['sidebarRightTabs', 'sidebarRight', 'slots'];

      function apply(ctx) {
        const scoped = ctx.inject(['sidebarRightTabs', 'slots'], (c) => {
          const tabs = c.sidebarRightTabs;
          if (!tabs || typeof tabs.register !== 'function') {
            console.warn('panel-entry: sidebarRightTabs unavailable');
            return;
          }
          const Body = makeBody(ctx);
          c.slots.inject('sidebar.right.pane.tab', () =>
            c.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, Body),
          );
          c.slots.inject('sidebar.right.pane.tab.title', () =>
            c.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, PanelTitle),
          );
          c.effect(
            () =>
              tabs.register({
                id: TAB_ID,
                kind: TAB_ID,
                title: () => 'Panel',
                guide: [
                  {
                    id: TAB_ID,
                    order: 25,
                    title: () => 'Panel',
                    description: () => '打开工作区的 NOTES.md',
                  },
                ],
              }),
            'panel-entry: Panel type',
          );
        });
        return scoped;
      }

      module.exports = { name, inject, apply };
    })(module, module.exports, require);
    return module.exports.default ?? module.exports;
  },
});
