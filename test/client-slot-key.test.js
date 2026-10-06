import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

test('client exposes its own bundle configuration and preserves older settings entries', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

  let capturedOptions
  const registrations = []
  const ctx = {
    slots: {
      inject(name, register) {
        assert.ok(['plugins.bundle.config', 'settings.plugins.tab', 'settings.plugin.item'].includes(name))
        register()
      },
      register(options, component) {
        capturedOptions = options
        registrations.push({ ...options, component })
        return {}
      },
    },
  }

  const React = {
    createElement(type, props, ...children) { return { type, props, children } },
    useEffect() {},
    useRef(initial) { return { current: initial } },
    useState(initial) { return [initial, () => {}] },
  }

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
  }

  runInNewContext(source, sandbox)
  client.apply(ctx)

  assert.ok(capturedOptions, 'expected settings.plugin.item registration')
  assert.equal(capturedOptions.name, 'settings.plugin.item')
  assert.equal(capturedOptions.key, 'dsh-dafeiyu')
  assert.equal(capturedOptions.id, 'dsh-dafeiyu')
  assert.equal(registrations[0].name, 'plugins.bundle.config')
  assert.equal(registrations[0].key, 'dsh-dafeiyu')
  const page = registrations[0].component({ view: 'page' })
  assert.equal(page.type, 'section')
  assert.equal(page.props['data-testid'], 'dsh-dafeiyu-settings')
  assert.equal(registrations[2].component().type, 'li')
  assert.equal(registrations[1].name, 'settings.plugins.tab')
  assert.equal(registrations[1].label(), '大肥鱼')
})

test('client apply does not throw when the slot contract changes or fails', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

  const React = {
    createElement() {},
    useEffect() {},
    useRef() { return { current: undefined } },
    useState() { return [] },
  }

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
    console: { error() {} },
  }

  runInNewContext(source, sandbox)

  // DSH may invoke the inject callback asynchronously, so a throw must be
  // contained inside that callback too. A broken card must degrade to "missing",
  // never fail the whole WebUI load.
  let registerAttempted = 0
  let injectAttempted = 0
  const deferred = []
  const ctx = {
    slots: {
      inject(name, register) {
        injectAttempted += 1
        assert.ok(['plugins.bundle.config', 'settings.plugins.tab', 'settings.plugin.item'].includes(name))
        deferred.push(register)
      },
      register() {
        registerAttempted += 1
        throw new Error('keyed slot settings.plugin.item requires options.key')
      },
    },
  }

  assert.doesNotThrow(() => client.apply(ctx))
  assert.equal(injectAttempted, 3)
  assert.equal(registerAttempted, 0)
  for (const register of deferred) assert.doesNotThrow(register)
  assert.equal(registerAttempted, 3)
})

test('client apply also contains a synchronous inject failure', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

  const React = {
    createElement() {},
    useEffect() {},
    useRef() { return { current: undefined } },
    useState() { return [] },
  }

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
    console: { error() {} },
  }
  runInNewContext(source, sandbox)

  let registerAttempted = 0
  const ctx = {
    slots: {
      inject() { throw new Error('slots service contract changed') },
      register() { registerAttempted += 1 },
    },
  }

  assert.doesNotThrow(() => client.apply(ctx))
  assert.equal(registerAttempted, 0)
})
