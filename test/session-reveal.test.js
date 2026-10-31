import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import { createEventStream } from '../src/plugin.js'

async function loadClient() {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let client
  const connections = []
  const cleanups = []
  const opened = []
  const warnings = []
  class EventSource {
    constructor(url) { this.url = url; connections.push(this) }
    close() { this.closed = true }
  }
  runInNewContext(source, {
    window: { __ModuleLoader__: { load({ factory }) {
      client = factory(() => ({ createElement() {}, useEffect() {}, useRef() {}, useState() {} }))
    } } },
    EventSource,
    fetch: async () => ({ ok: true, json: async () => ({ webOverlay: false }) }),
    console: { warn: (...args) => warnings.push(args), error: (...args) => warnings.push(args) },
  })
  const ctx = {
    slots: { inject() {}, register() {} },
    get(name) {
      assert.ok(client.inject.includes(name), `${name} must be declared in inject`)
      assert.equal(name, 'uiWorkspace')
      // Published DSH 0.2.0-rc.2 UiWorkspaceService exposes openSession.
      // `open` belongs to its sidebar slot props, not this service.
      return { openSession: (sessionId) => opened.push(sessionId) }
    },
    effect(setup) { cleanups.push(setup()) },
  }
  client.apply(ctx)
  await new Promise((resolve) => setImmediate(resolve))
  return { connections, cleanups, opened, warnings }
}

test('native task reveal opens the requested session with webOverlay disabled and disposes its stream', async () => {
  const { connections, cleanups, opened, warnings } = await loadClient()
  assert.equal(connections.length, 1, 'native task navigation must subscribe without the page pet')
  const stream = connections[0]
  assert.equal(stream.url, '/plugins/dsh-dafeiyu/events?reveal=1')
  for (const data of ['bad json', '{"kind":"state"}', '{"kind":"reveal","sessionId":""}']) {
    stream.onmessage({ data })
  }
  assert.deepEqual(opened, [])
  stream.onmessage({ data: JSON.stringify({ kind: 'reveal', sessionId: 'task-B' }) })
  assert.deepEqual(opened, ['task-B'])
  assert.deepEqual(warnings, [])
  for (const dispose of cleanups) dispose?.()
  assert.equal(stream.closed, true)
})

test('only navigation-capable subscribers receive transient reveal requests; reconnects do not replay them', () => {
  const stream = createEventStream()
  const ordinary = []
  const navigation = []
  stream.add({ write: (data) => ordinary.push(data) })
  const remove = stream.add({ write: (data) => navigation.push(data) }, { reveal: true })
  assert.equal(stream.revealClientCount, 1)
  stream.broadcast({ protocolVersion: 1, kind: 'reveal', sessionId: 'task-B' })
  assert.equal(ordinary.length, 0)
  assert.equal(navigation.length, 1)
  const reconnected = []
  stream.add({ write: (data) => reconnected.push(data) }, { reveal: true })
  assert.deepEqual(reconnected, [])
  remove()
  assert.equal(stream.revealClientCount, 1)
})

async function revealThroughHost(t, { navigation = true, disposed = false, disconnected = false } = {}) {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const { EventEmitter } = await import('node:events')
  const { apply, EVENTS_ENDPOINT } = await import('../src/plugin.js')
  const directory = await mkdtemp(join(tmpdir(), 'dsh-reveal-'))
  const resultLog = join(directory, 'result.jsonl')
  const listeners = new Map()
  const routes = new Map()
  const disposers = []
  const chunks = []
  const req = new EventEmitter()
  req.url = `${EVENTS_ENDPOINT}${navigation ? '?reveal=1' : ''}`
  req.socket = { remoteAddress: '127.0.0.1' }
  req.headers = { host: 'localhost:3080' }
  const ctx = {
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    on(name, callback) { listeners.set(name, callback); return () => listeners.delete(name) },
    effect(setup) { disposers.push(setup()) },
    inject(services, callback) {
      callback({
        webServer: { register({ path, handler }) { routes.set(path, handler); return () => routes.delete(path) } },
        effect(setup) { disposers.push(setup()) },
      })
    },
  }
  t.after(async () => {
    req.emit('close')
    for (const dispose of disposers.reverse()) dispose?.()
    await rm(directory, { recursive: true, force: true })
  })
  const fallbackBefore = process.env.DSH_DAFEIYU_USER_SETTINGS
  process.env.DSH_DAFEIYU_USER_SETTINGS = join(directory, 'user-settings.json')
  try {
    apply(ctx, { balanceEnabled: false, helper: {
      command: process.execPath,
      args: [fileURLToPath(new URL('fixtures/reveal-helper.js', import.meta.url)), resultLog],
      headless: false, heartbeatMs: 0, logFile: null, tempDirectory: null,
    } })
  } finally {
    if (fallbackBefore === undefined) delete process.env.DSH_DAFEIYU_USER_SETTINGS
    else process.env.DSH_DAFEIYU_USER_SETTINGS = fallbackBefore
  }
  routes.get(EVENTS_ENDPOINT)(req, { writeHead() {}, write(data) {
    if (disconnected && data.includes('\"kind\":\"reveal\"')) throw new Error('connection reset')
    chunks.push(data)
  } })
  const a = { header: { id: 'task-A' } }
  const b = { header: { id: 'task-B' } }
  listeners.get('session/event')(a, { type: 'turn/start', seq: 1, data: { turn: 1 } })
  listeners.get('session/event')(b, { type: 'turn/start', seq: 1, data: { turn: 1 } })
  // The helper's async stdout request arrives after disposal, as with a stale click.
  if (disposed) listeners.get('session/disposed')(b)
  const deadline = Date.now() + 2000
  let result
  while (Date.now() < deadline) {
    try { result = JSON.parse((await readFile(resultLog, 'utf8')).trim()); break } catch {}
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.ok(result, 'helper must receive explicit navigation feedback')
  const reveals = chunks.filter((data) => data.startsWith('data: '))
    .map((data) => JSON.parse(data.slice(6))).filter((message) => message.kind === 'reveal')
  return { result, reveals }
}

test('helper stdout → Host → SSE → client navigates to the matching session', async (t) => {
  const { result, reveals } = await revealThroughHost(t)
  assert.equal(result.ok, true)
  assert.equal(reveals.length, 1)
  assert.equal(reveals[0].sessionId, 'task-B')
  const client = await loadClient()
  client.connections[0].onmessage({ data: JSON.stringify(reveals[0]) })
  assert.deepEqual(client.opened, ['task-B'])
  for (const dispose of client.cleanups) dispose?.()
})

test('balance-only subscribers cannot be mistaken for an open session page', async (t) => {
  const { result, reveals } = await revealThroughHost(t, { navigation: false })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'no-client')
  assert.deepEqual(reveals, [])
})

test('a task disposed before the click is handled produces feedback without navigation', async (t) => {
  const { result, reveals } = await revealThroughHost(t, { disposed: true })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'session-unavailable')
  assert.deepEqual(reveals, [])
})


test('a navigation socket that fails before delivery produces no-client feedback', async (t) => {
  const { result, reveals } = await revealThroughHost(t, { disconnected: true })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'no-client')
  assert.deepEqual(reveals, [])
})
