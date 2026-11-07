/**
 * Host half of the Pele diagram plugin.
 *
 * Two small capabilities live here:
 *  - The browser half needs the Pele runtime only after the first Mermaid
 *    code block appears, so it is served lazily from this package instead of
 *    being inlined into the client bundle (the bundle is small; the runtime
 *    is a few hundred KB). The route is same-origin and content-addressed by version
 *    in its path, so the browser may cache it immutably.
 *  - Appearance preferences are profile data, not browser data: the GUI may be
 *    served from a new port on every launch, so `localStorage` alone would
 *    lose them. The second route persists one small JSON document under
 *    `$DSH_HOME/pele-diagram/settings.json` (the same home resolution the
 *    rest of the harness uses: configured path, then `$DSH_HOME`, then
 *    `~/.dsh`).
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const inject = ['webServer']

/** Public path of the vendored Pele runtime (mirrored by client.js). */
export const RUNTIME_PATH = '/pele-diagram/runtime/pele-1.13.0.js'
/** Public path of the optional KaTeX runtime (mirrored by client.js). */
export const KATEX_PATH = '/pele-diagram/runtime/katex-0.19.1.min.js'
/** Public path of the persisted appearance preferences (mirrored by client.js). */
export const SETTINGS_PATH = '/pele-diagram/settings'

const RUNTIME_FILE = new URL('./vendor/pele-1.13.0.js', import.meta.url)
const KATEX_FILE = new URL('./vendor/katex-0.19.1.min.js', import.meta.url)
const MAX_SETTINGS_BYTES = 64 * 1024

/** Serve one vendored JavaScript file; content-addressed paths may cache forever. */
async function serveScript(file, req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405)
    res.end()
    return
  }
  let body
  try {
    body = await readFile(file)
  } catch {
    res.writeHead(404)
    res.end()
    return
  }
  res.writeHead(200, {
    'content-type': 'text/javascript; charset=utf-8',
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  })
  res.end(req.method === 'HEAD' ? undefined : body)
}

function settingsFile() {
  const configured = typeof process.env.DSH_HOME === 'string' ? process.env.DSH_HOME.trim() : ''
  const home = configured !== '' ? configured : join(homedir(), '.dsh')
  return join(home, 'pele-diagram', 'settings.json')
}

function json(res, status, value, method) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(Buffer.byteLength(body)),
    'x-content-type-options': 'nosniff',
  })
  res.end(method === 'HEAD' ? undefined : body)
}

/** Reject a write that another page origin asks for (basic CSRF fence). */
function originAllowed(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '' || origin === 'null') return true
  let parsed
  try {
    parsed = new URL(origin)
  } catch {
    return false
  }
  // The desktop shell serves the page from a custom scheme; its forwarded
  // requests carry that origin, which has no comparable Host.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true
  const host = req.headers.host
  return typeof host === 'string' && parsed.host === host
}

async function readBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    total += bytes.byteLength
    if (total > MAX_SETTINGS_BYTES) throw new Error('settings payload too large')
    chunks.push(bytes)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function readSettings() {
  try {
    const text = await readFile(settingsFile(), 'utf8')
    const value = JSON.parse(text)
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

async function writeSettings(value) {
  const file = settingsFile()
  await mkdir(dirname(file), { recursive: true })
  const temporary = file + '.tmp-' + process.pid
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8')
  await rename(temporary, file)
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: RUNTIME_PATH,
    handler: (req, res) => serveScript(RUNTIME_FILE, req, res),
  }), 'pele-diagram: vendored runtime route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: KATEX_PATH,
    handler: (req, res) => serveScript(KATEX_FILE, req, res),
  }), 'pele-diagram: KaTeX runtime route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: SETTINGS_PATH,
    async handler(req, res) {
      if (req.method === 'GET' || req.method === 'HEAD') {
        json(res, 200, { settings: await readSettings() }, req.method)
        return
      }
      if (req.method !== 'PUT' && req.method !== 'POST') {
        res.writeHead(405, { allow: 'GET, HEAD, PUT, POST' })
        res.end()
        return
      }
      if (!originAllowed(req)) {
        json(res, 403, { ok: false, error: 'forbidden origin' }, req.method)
        return
      }
      try {
        const parsed = JSON.parse(await readBody(req))
        const settings = parsed && parsed.settings
        if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
          json(res, 400, { ok: false, error: 'settings must be an object' }, req.method)
          return
        }
        await writeSettings(settings)
        json(res, 200, { ok: true }, req.method)
      } catch (error) {
        json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) }, req.method)
      }
    },
  }), 'pele-diagram: appearance preferences route')
}
