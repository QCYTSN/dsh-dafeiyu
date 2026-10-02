import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

// The settings card lives in the Plugins settings section as one tab beside the
// shipped plugin list. That seat is `settings.plugins.tab`: a LIST slot taking
// `id`/`order`/`label`, with no inject face. An earlier revision registered into
// `settings.plugin.item` - a seat that no longer exists - and passed a `key` and
// an `inject`; `slots.inject` then simply waited forever, so the card vanished
// with no error anywhere. These assertions exist to keep that from coming back.

test('client registers the card into settings.plugins.tab as a list entry', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

  let capturedOptions
  const ctx = {
    slots: {
      inject(name, register) {
        assert.equal(name, 'settings.plugins.tab')
        register()
      },
      register(options) {
        capturedOptions = options
        return {}
      },
    },
  }

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
    console,
  }

  runInNewContext(source, sandbox)
  client.apply(ctx)

  assert.ok(capturedOptions, 'expected a settings.plugins.tab registration')
  assert.equal(capturedOptions.name, 'settings.plugins.tab')
  assert.equal(capturedOptions.id, 'dsh-dafeiyu')
  // A list slot has no key cell, and this slot declares no inject face; asking
  // for either is what silently killed the card.
  assert.equal(capturedOptions.key, undefined, 'settings.plugins.tab takes no key')
  assert.equal(capturedOptions.inject, undefined, 'settings.plugins.tab declares no inject face')
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
  const ctx = {
    slots: {
      inject(name, register) {
        injectAttempted += 1
        assert.equal(name, 'settings.plugins.tab')
        register() // simulate DSH invoking the card registration later
      },
      register() {
        registerAttempted += 1
        throw new Error('slot contract changed')
      },
    },
  }

  assert.doesNotThrow(() => client.apply(ctx))
  assert.equal(injectAttempted, 1)
  assert.equal(registerAttempted, 1)
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
