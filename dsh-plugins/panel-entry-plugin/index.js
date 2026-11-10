/**
 * Host half: one tiny route, `/dsh-panel-entry/ensure`.
 *
 * The Panel entry asks it for the note before opening the file address, so a
 * workspace without NOTES.md gets a skeleton instead of an empty editor. It
 * never overwrites an existing file: creation goes through `wx`, so a racing
 * create wins and we report what is actually on disk.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';

export const name = 'panel-entry';

/**
 * cordis calls `apply` only after these services exist. Without the
 * declaration the callback ran too early, `ctx.webServer` was undefined, the
 * effect threw, and the route silently never mounted — the client then saw a
 * 404 from the host's own catch-all, not from this plugin.
 */
export const inject = ['webServer'];

const ROUTE = '/dsh-panel-entry';
const DEFAULT_FILE = 'NOTES.md';

const SKELETON = `# 面板笔记

> 这份文件由右栏的 Panel 入口打开：agent 按 panel-note 规范往下追加，你直接改。
`;

/** Answer one JSON envelope; the client only cares about `ok` and `message`. */
function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function apply(ctx) {
  const log = ctx.logger ?? console;

  const handler = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.replace(/\/+$/, '') !== `${ROUTE}/ensure`) {
      reply(res, 404, { ok: false, message: 'not found' });
      return;
    }

    const cwd = url.searchParams.get('cwd') ?? '';
    const rel = url.searchParams.get('path') ?? DEFAULT_FILE;
    if (cwd === '' || !isAbsolute(cwd)) {
      reply(res, 400, { ok: false, message: 'cwd 必须是绝对路径' });
      return;
    }
    if (isAbsolute(rel) || rel.split(sep).includes('..')) {
      reply(res, 400, { ok: false, message: 'path 必须是工作区内的相对路径' });
      return;
    }

    const root = resolve(cwd);
    const target = resolve(root, rel);
    if (target !== root && !target.startsWith(root + sep)) {
      reply(res, 400, { ok: false, message: 'path 落在工作区之外' });
      return;
    }

    try {
      await mkdir(dirname(target), { recursive: true });
      let created = false;
      try {
        await writeFile(target, SKELETON, { encoding: 'utf8', flag: 'wx' });
        created = true;
      } catch (cause) {
        // EEXIST is the normal path: the note is already there (or a racing
        // create won). Anything else is a real failure.
        if (cause?.code !== 'EEXIST') throw cause;
      }
      reply(res, 200, { ok: true, path: target, created });
    } catch (cause) {
      log.warn?.('panel-entry: ensure failed', cause);
      reply(res, 500, { ok: false, message: String(cause?.message ?? cause) });
    }
  };

  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler }),
    'panel-entry: routes',
  );
}
