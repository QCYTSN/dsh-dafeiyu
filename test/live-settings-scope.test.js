// Unit tests for the settings adapter.
//
// Current DSH removed `settings.register()`, so this adapter is the seam
// between the plugin's { get, watch, update } expectation and the live
// `describe` / `update` / `settings/document-updated` API. It is exercised here
// against a stub service because the real one only exists inside a running DSH,
// where a module reload also needs a restart to be picked up.
//
// Run: node --test test/

import assert from 'node:assert/strict'
import test from 'node:test'

import { Config, createLiveSettingsScope, publicConfig } from '../src/plugin.js'

const PACKAGE_NAME = 'dsh-dafeiyu'

test('the Config schema is marked volatile so DSH lists the entry', () => {
  // describe() drops every entry whose schema yields no volatile form, so
  // without this flag the plugin stays absent from the settings directory and
  // every save fails with "not in the DSH settings directory".
  assert.equal(Config.meta?.volatile, true)
})

function stubContext({ descriptors, describe, update } = {}) {
  const listeners = new Map()
  const service = {
    describe: describe ?? (() => descriptors ?? []),
    update: update ?? (async () => {}),
  }
  const ctx = {
    settings: service,
    on(name, handler) {
      listeners.set(name, handler)
      return () => listeners.delete(name)
    },
  }
  return { ctx, service, emit: (name, ...args) => listeners.get(name)?.(...args), listeners }
}

function descriptor(value, ns = `include:${PACKAGE_NAME}`) {
  return { ns, value, revision: 1 }
}

const base = publicConfig({})

test('adopts the matching descriptor and merges it over the base config', () => {
  const { ctx } = stubContext({ descriptors: [descriptor({ scale: 1.3, bubbleMode: 'always' })] })
  const scope = createLiveSettingsScope(ctx, base, console)
  assert.ok(scope, 'a live scope is expected when the service is usable')
  assert.equal(scope.get().scale, 1.3)
  assert.equal(scope.get().bubbleMode, 'always')
  // Fields the user never touched keep the plugin's own default.
  assert.equal(scope.get().clickThroughHotkey, base.clickThroughHotkey)
})

test('recognises its entry by config fingerprint when the namespace is opaque', () => {
  const { ctx } = stubContext({
    descriptors: [{
      ns: 'include:9f31ac',
      value: { bubbleMode: 'hidden', clickThroughHotkey: 'Ctrl+Shift+G', includeSubagents: false, webOverlay: false },
    }],
  })
  const scope = createLiveSettingsScope(ctx, base, console)
  assert.ok(scope)
  assert.equal(scope.get().bubbleMode, 'hidden')
  assert.equal(scope.get().clickThroughHotkey, 'Ctrl+Shift+G')
})

test('ignores entries that belong to other plugins', () => {
  const { ctx } = stubContext({
    descriptors: [descriptor({ scale: 0.9 }, 'include:some-other-plugin')],
  })
  const scope = createLiveSettingsScope(ctx, base, console)
  assert.ok(scope)
  assert.equal(scope.get().scale, base.scale, 'another plugin\'s entry must not be adopted')
})

test('update writes through the service and reflects the new value', async () => {
  const calls = []
  const value = { scale: 1 }
  const { ctx } = stubContext({
    descriptors: [descriptor(value)],
    update: async (ns, patch) => {
      calls.push([ns, patch])
      Object.assign(value, patch)
    },
  })
  const scope = createLiveSettingsScope(ctx, base, console)
  await scope.update({ scale: 1.25 })
  assert.deepEqual(calls, [[`include:${PACKAGE_NAME}`, { scale: 1.25 }]])
  assert.equal(scope.get().scale, 1.25, 'the writer must see its own value without a reload')
})

test('watchers fire for our own entry only', () => {
  const value = { scale: 1 }
  const { ctx, emit } = stubContext({ descriptors: [descriptor(value)] })
  const scope = createLiveSettingsScope(ctx, base, console)
  const seen = []
  scope.watch((next) => seen.push(next.scale))

  value.scale = 1.1
  emit('settings/document-updated', 'include:another-plugin', 2)
  assert.deepEqual(seen, [], 'another plugin\'s edit must not restart the pet')

  emit('settings/document-updated', `include:${PACKAGE_NAME}`, 3)
  assert.deepEqual(seen, [1.1])
})

test('a no-op announcement does not notify twice', () => {
  const { ctx, emit } = stubContext({ descriptors: [descriptor({ scale: 1 })] })
  const scope = createLiveSettingsScope(ctx, base, console)
  let count = 0
  scope.watch(() => { count += 1 })
  emit('settings/document-updated', `include:${PACKAGE_NAME}`, 2)
  assert.equal(count, 0, 'an unchanged snapshot is not a change')
})

test('falls back to undefined when the service is older or unusable', () => {
  assert.equal(createLiveSettingsScope({}, base, console), undefined)
  assert.equal(createLiveSettingsScope({ settings: {} }, base, console), undefined)
  assert.equal(
    createLiveSettingsScope({ settings: { describe: () => [] } }, base, console),
    undefined,
    'a service without update cannot back a writable scope',
  )
})

test('an unmatched entry stays readable and refuses writes clearly', async () => {
  const { ctx } = stubContext({ descriptors: [] })
  const scope = createLiveSettingsScope(ctx, base, console)
  assert.ok(scope, 'the scope still exists so the card can render current values')
  assert.equal(scope.get().scale, base.scale)
  await assert.rejects(() => scope.update({ scale: 1.2 }), /not in the DSH settings directory/)
})

test('a broken describe() degrades instead of throwing', () => {
  const { ctx } = stubContext({
    describe: () => { throw new Error('nope') },
  })
  const scope = createLiveSettingsScope(ctx, base, console)
  assert.ok(scope)
  assert.equal(scope.get().scale, base.scale)
})

test('dispose detaches the settings listener', () => {
  const { ctx, listeners } = stubContext({ descriptors: [descriptor({})] })
  const scope = createLiveSettingsScope(ctx, base, console)
  assert.equal(listeners.has('settings/document-updated'), true)
  scope.dispose()
  assert.equal(listeners.has('settings/document-updated'), false)
})

// The host does not reconcile the running composition for a config write, so a
// write must be applied here and pushed to the helper; otherwise the caller
// reads the stale live value straight back and the control snaps back.

test('a write is reflected immediately even though the host stays stale', async () => {
  const live = { scale: 1, bubbleMode: 'hover' }
  const { ctx } = stubContext({
    descriptors: [descriptor(live)],
    update: async () => {}, // persists, but the live descriptor never moves
  })
  const scope = createLiveSettingsScope(ctx, base, console)
  const seen = []
  scope.watch((next) => seen.push({ scale: next.scale, bubbleMode: next.bubbleMode }))

  await scope.update({ scale: 0.65 })
  assert.equal(scope.get().scale, 0.65, 'the writer must see the value it just sent')
  assert.deepEqual(seen, [{ scale: 0.65, bubbleMode: 'hover' }], 'the helper must be told at once')
})

test('a stale document-updated echo does not revert an applied write', async () => {
  const live = { scale: 1, bubbleMode: 'hover' }
  const { ctx, emit } = stubContext({
    descriptors: [descriptor(live)],
    update: async () => {},
  })
  const scope = createLiveSettingsScope(ctx, base, console)
  await scope.update({ scale: 0.65 })

  live.bubbleMode = 'always' // an unrelated live change, scale still stale
  emit('settings/document-updated', `include:${PACKAGE_NAME}`, 5)

  assert.equal(scope.get().scale, 0.65, 'the applied value must survive a stale echo')
  assert.equal(scope.get().bubbleMode, 'always', 'genuinely live fields still follow the host')
})

test('a write is handed back to the host once the live value catches up', async () => {
  const live = { scale: 1 }
  const { ctx } = stubContext({
    descriptors: [descriptor(live)],
    update: async () => {},
  })
  const scope = createLiveSettingsScope(ctx, base, console)
  await scope.update({ scale: 0.65 })
  live.scale = 0.65 // the next start reconciles the entry
  // Re-reading is what locate() does on every call, so a fresh scope stands in
  // for the next process and must agree with the persisted value.
  const reopened = createLiveSettingsScope(stubContext({ descriptors: [descriptor(live)] }).ctx, base, console)
  assert.equal(reopened.get().scale, 0.65)
})

test('successive writes accumulate instead of clobbering each other', async () => {
  const live = { scale: 1, bubbleMode: 'hover' }
  const { ctx } = stubContext({
    descriptors: [descriptor(live)],
    update: async () => {},
  })
  const scope = createLiveSettingsScope(ctx, base, console)
  await scope.update({ scale: 0.65 })
  await scope.update({ bubbleMode: 'always' })
  assert.equal(scope.get().scale, 0.65, 'the earlier write must not be lost to a stale descriptor')
  assert.equal(scope.get().bubbleMode, 'always')
})
