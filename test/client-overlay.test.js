import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const React = {
  createElement() {},
  useEffect() {},
  useRef() { return { current: undefined } },
  useState() { return [undefined, () => {}] },
}

function loadClient(fetchImpl, source, extras = {}) {
  let client
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load({ factory }) {
          client = factory((id) => {
            if (id === 'react') return extras.React ?? React
            throw new Error(`unexpected require: ${id}`)
          })
        },
      },
    },
    console,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
    ...extras,
  }
  runInNewContext(source, sandbox)
  return { client, sandbox }
}

test('client overlay registration follows the webOverlay setting', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

  const calls = []
  const ctx = {
    slots: {
      inject(name, register) {
        calls.push(['inject', name])
        register()
      },
      register(options) { calls.push(['register', options.name, options.id]); return {} },
    },
  }

  const enabled = loadClient(async (url) => ({
    ok: true,
    json: async () => (url.endsWith('/config') ? { webOverlay: true } : { formatVersion: 1, clips: { idle: { frames: ['idle/idle_001.webp'], frameMs: 125 } }, stateMap: {} }),
  }), source)
  enabled.client.apply(ctx)
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(
    calls.filter(([kind, name]) => kind === 'register' && name === 'shell.overlay').map(([, , id]) => id),
    ['dsh-dafeiyu-overlay'],
  )

  calls.length = 0
  const disabled = loadClient(async (url) => ({
    ok: true,
    json: async () => (url.endsWith('/config') ? { webOverlay: false } : {}),
  }), source)
  disabled.client.apply(ctx)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls.some((entry) => entry[1] === 'shell.overlay'), false)
})

async function animatedOverlay() {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  const clips = Object.fromEntries(['idle', 'thinking', 'command', 'success', 'error'].map((name) => [name, {
    frames: Array.from({ length: name === 'success' ? 10 : 5 }, (_, i) => `${name}/${i}.webp`),
    frameMs: 100, loop: !['success', 'error'].includes(name),
  }]))
  const manifest = { clips, stateMap: { IDLE: 'idle', THINKING: 'thinking', WORKING: 'command', SUCCESS: 'success', ERROR: 'error' }, workingActivityMap: { commanding: 'command' } }
  const urls = []
  let overlay, nextFrame, events, now = 0, cleanup
  const { client } = loadClient(async (url) => ({ ok: true, json: async () => url.endsWith('/config') ? { webOverlay: true } : manifest }), source, {
    React: {
      ...React,
      createElement(type) { if (type?.name === 'PetOverlay') overlay = type },
      useState(initial) { return [initial, (value) => urls.push(value)] },
      useEffect(effect) { cleanup = effect() },
    },
    requestAnimationFrame(callback) { nextFrame = callback; return 1 },
    cancelAnimationFrame() { nextFrame = null },
    Date: { now: () => now },
    EventSource: class { constructor() { events = this } close() {} },
  })
  client.apply({ slots: { inject(name, register) { register() }, register(options, render) { if (options.name === 'shell.overlay') render() } } })
  await new Promise((resolve) => setImmediate(resolve))
  overlay()
  await new Promise((resolve) => setImmediate(resolve))
  return {
    frame: () => decodeURIComponent(urls.at(-1).split('?frame=')[1]),
    step(time) { now = time; const callback = nextFrame; callback(time) },
    message(message) { events.onmessage({ data: JSON.stringify(message) }) },
    close() { cleanup() },
  }
}

test('overlay starts at the first frame and repeated work events do not restart it', async () => {
  const pet = await animatedOverlay()
  assert.equal(pet.frame(), 'idle/0.webp')
  pet.step(1)
  pet.message({ kind: 'state', state: 'WORKING', activity: 'commanding' })
  pet.step(201)
  assert.equal(pet.frame(), 'command/2.webp')
  pet.message({ kind: 'state', state: 'WORKING', activity: 'commanding' })
  assert.equal(pet.frame(), 'command/2.webp')
  pet.step(301)
  assert.equal(pet.frame(), 'command/3.webp')
  pet.close()
})

test('overlay completion plays the full clip, survives idle snapshots and yields to new work', async () => {
  const pet = await animatedOverlay()
  pet.step(1)
  pet.message({ kind: 'pulse', state: 'SUCCESS', ttlMs: 200, resumeState: 'IDLE' })
  assert.equal(pet.frame(), 'success/0.webp')
  pet.step(301)
  assert.equal(pet.frame(), 'success/3.webp')
  pet.message({ kind: 'state', state: 'IDLE' })
  assert.equal(pet.frame(), 'success/3.webp')
  pet.step(1001)
  assert.equal(pet.frame(), 'idle/0.webp')
  pet.message({ kind: 'pulse', state: 'SUCCESS', ttlMs: 200, resumeState: 'IDLE' })
  pet.message({ kind: 'state', state: 'THINKING' })
  assert.equal(pet.frame(), 'thinking/0.webp')
  pet.close()
})

test('overlay error holds its final pose and reduced motion stops frame advancement', async () => {
  const pet = await animatedOverlay()
  pet.step(1)
  pet.message({ kind: 'state', state: 'ERROR' })
  pet.step(601)
  assert.equal(pet.frame(), 'error/4.webp')
  pet.step(1201)
  assert.equal(pet.frame(), 'error/4.webp')
  pet.message({ kind: 'state', state: 'WORKING', activity: 'commanding' })
  pet.message({ kind: 'config', reducedMotion: true })
  pet.step(2001)
  assert.equal(pet.frame(), 'command/0.webp')
  pet.message({ kind: 'config', reducedMotion: false })
  pet.step(2101)
  assert.equal(pet.frame(), 'command/1.webp')
  pet.close()
})

test('client overlay stays silent when the endpoints or fetch are unavailable', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  const ctx = {
    slots: {
      inject(name) { throw new Error(`slot ${name} unavailable`) },
      register() { return {} },
    },
  }

  // No fetch in the sandbox at all (older host): apply must not throw.
  const noFetch = loadClient(undefined, source)
  noFetch.client.apply(ctx)
  await new Promise((resolve) => setImmediate(resolve))

  // Fetch rejects: still no throw, no overlay.
  const failing = loadClient(async () => { throw new Error('offline') }, source)
  failing.client.apply(ctx)
  await new Promise((resolve) => setImmediate(resolve))
})
