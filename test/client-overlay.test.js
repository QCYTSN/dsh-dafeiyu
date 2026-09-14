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

function loadClient(fetchImpl, source) {
  let client
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load({ factory }) {
          client = factory((id) => {
            if (id === 'react') return React
            throw new Error(`unexpected require: ${id}`)
          })
        },
      },
    },
    console,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
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
