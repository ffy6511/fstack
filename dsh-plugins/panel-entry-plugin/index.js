import { writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { PanelError, panelStore } from './src/store.js';

export const name = 'panel-entry';
export const inject = ['webServer'];
const ROUTE = '/dsh-panel-entry';
const SKELETON = '# 面板笔记\n\n> agent 按 panel-note 规范往下追加，你在右栏直接改。\n';

function reply(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

async function bodyOf(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > 128 * 1024) throw new PanelError('内容过长', 413);
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new PanelError('请求需要 JSON 内容');
  }
}

function trusted(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  if (req.headers.origin) {
    let origin;
    try {
      origin = new URL(req.headers.origin);
    } catch {
      return false;
    }
    if (origin.host !== req.headers.host) return false;
  }
  return (
    req.method === 'GET' ||
    (req.headers['content-type']?.split(';')[0] === 'application/json' &&
      req.headers['x-panel-action'] === '1')
  );
}

export function createHandler(store = panelStore(), log = console) {
  return async (req, res) => {
    try {
      if (!trusted(req)) throw new PanelError('请从 DSH 面板操作', 403);
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname.replace(/\/+$/, '').slice(ROUTE.length);
      if (!['/state', '/action', '/ensure'].includes(route)) throw new PanelError('Not found', 404);
      const expected = route === '/state' ? 'GET' : 'POST';
      if (req.method !== expected) {
        res.setHeader('allow', expected);
        throw new PanelError(`Use ${expected}`, 405);
      }
      const cwd = url.searchParams.get('cwd');
      if (!cwd || !isAbsolute(cwd)) throw new PanelError('工作区目录需要是绝对路径');
      if (route === '/state') return reply(res, 200, { ok: true, state: await store.read(cwd) });
      if (route === '/action') {
        const state = await store.act(cwd, await bodyOf(req));
        return reply(res, 200, { ok: true, state });
      }
      const path = join(cwd, 'NOTES.md');
      let created = false;
      try {
        await writeFile(path, SKELETON, { encoding: 'utf8', flag: 'wx' });
        created = true;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      reply(res, 200, { ok: true, path, created });
    } catch (error) {
      const status = error.status ?? 500;
      if (status === 500) log.warn?.('panel-entry:', error);
      reply(res, status, {
        ok: false,
        message: status === 500 ? '读写面板失败，请检查目录权限与 DSH 日志' : error.message,
      });
    }
  };
}

export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE,
        handler: createHandler(panelStore(), ctx.logger ?? console),
      }),
    'panel-entry: routes',
  );
}
