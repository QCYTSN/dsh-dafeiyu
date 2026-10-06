import assert from 'node:assert/strict'
import test from 'node:test'
import { createSettingsScope, plainConfig } from '../src/settings-scope.js'
import { Config } from '../src/index.js'

test('settings use this loader entry and apply persisted changes live on DSH 0.2', async () => {
  const listeners = new Map()
  let user = {}
  const scope = createSettingsScope({
    fiber: { entry: { options: { id: 'my-bigfish-instance' } } },
    on: (name, callback) => { listeners.set(name, callback); return () => listeners.delete(name) },
    settings: {
      describe: () => [{ ns: 'my-bigfish-instance', value: { scale: 1 }, user }],
      async update(ns, patch) { assert.equal(ns, 'my-bigfish-instance'); user = { ...user, ...patch } },
    },
  }, Config, { scale: { get: () => 1 } }, (value) => ({ scale: value.scale ?? 1 }))
  const applied = []
  scope.watch((value) => applied.push(value.scale))
  await scope.update({ scale: 0.8 })
  assert.equal(scope.get().scale, 0.8)
  listeners.get('settings/document-updated')('another-plugin')
  assert.deepEqual(applied, [0.8])
  user = { scale: 1.2 }
  listeners.get('settings/document-updated')('my-bigfish-instance')
  assert.equal(scope.get().scale, 1.2)
  scope.dispose()
  assert.equal(listeners.size, 0)
})

test('volatile config values are read as values and fields are exposed as live settings', () => {
  assert.deepEqual(plainConfig({ enabled: { get: () => true }, bubbleStates: { get: () => ['ERROR'] } }), { enabled: true, bubbleStates: ['ERROR'] })
  assert.notEqual(Config.meta.volatile, true, 'the whole config must remain an object')
  for (const field of Object.values(Config.dict)) assert.equal(field.meta.volatile, true)
})

test('legacy settings registration and read-only hosts retain safe behavior', () => {
  const legacy = { get: () => ({ scale: 0.8 }), watch: () => () => {} }
  assert.equal(createSettingsScope({ settings: { register: (_ns, schema, options) => {
    assert.equal(schema({ scale: 0.8 }).scale, 0.8)
    assert.equal(options.base.scale, 0.75)
    return legacy
  } } }, Config, { scale: { get: () => 0.75 } }, (value) => value), legacy)
  const readonly = createSettingsScope({}, Config, { scale: 1 }, (value) => value)
  assert.equal(readonly.update, undefined)
  readonly.dispose()
})
