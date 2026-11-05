import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { createUserSettingsStore, defaultUserSettingsPath } from '../src/user-settings.js'

function makeDirectory(prefix) {
  return mkdtempSync(join(tmpdir(), prefix))
}

test('native menu fallback lives under DSH_HOME and can be overridden', () => {
  assert.equal(
    defaultUserSettingsPath({ env: { DSH_HOME: '/home/me/.dsh' }, home: '/home/me' }),
    join('/home/me/.dsh', 'dsh-dafeiyu', 'user-settings.json'),
  )
  assert.equal(
    defaultUserSettingsPath({ env: {}, home: '/home/me' }),
    join('/home/me', '.dsh', 'dsh-dafeiyu', 'user-settings.json'),
  )
  assert.equal(
    defaultUserSettingsPath({ env: { DSH_DAFEIYU_USER_SETTINGS: '/tmp/override.json' }, home: '/home/me' }),
    resolve('/tmp/override.json'),
  )
})

test('a menu choice survives while the host keeps its old baseline', () => {
  const file = join(makeDirectory('dsh-dafeiyu-user-settings-'), 'user-settings.json')
  const store = createUserSettingsStore(file)
  const host = { scale: 1, bubbleScale: 1, reducedMotion: false }

  assert.deepEqual(store.apply(host), host)
  assert.equal(store.record({ scale: 0.8 }, host), true)
  assert.deepEqual(store.apply(host), { ...host, scale: 0.8 })
  assert.equal(existsSync(file), true)

  // A new store reads the same value back after a helper or host restart.
  const reloaded = createUserSettingsStore(file)
  assert.deepEqual(reloaded.apply(host), { ...host, scale: 0.8 })
  assert.equal(reloaded.snapshot().scale.value, 0.8)
  assert.equal(reloaded.snapshot().scale.host, 1)
})

test('the menu can go down to the 30% minimum', () => {
  const file = join(makeDirectory('dsh-dafeiyu-user-settings-'), 'user-settings.json')
  const store = createUserSettingsStore(file)
  assert.equal(store.record({ scale: 0.3 }, { scale: 1 }), true)
  assert.deepEqual(store.apply({ scale: 1 }), { scale: 0.3 })
  assert.equal(store.snapshot().scale.value, 0.3)
})

test('a host echo of the menu value keeps the fallback alive', () => {
  const file = join(makeDirectory('dsh-dafeiyu-user-settings-'), 'user-settings.json')
  const store = createUserSettingsStore(file)
  store.record({ scale: 0.8 }, { scale: 1 })

  // DSH may update its in-memory value immediately even when the profile patch
  // never reaches disk; keeping the fallback protects the next DSH restart.
  assert.deepEqual(store.apply({ scale: 0.8 }), { scale: 0.8 })
  assert.equal(store.snapshot().scale.value, 0.8)
  assert.equal(store.snapshot().scale.host, 1)
})

test('a host-side change wins over an older menu fallback', () => {
  const file = join(makeDirectory('dsh-dafeiyu-user-settings-'), 'user-settings.json')
  const store = createUserSettingsStore(file)
  store.record({ scale: 0.8, bubbleScale: 0.8 }, { scale: 1, bubbleScale: 1 })

  const host = { scale: 1.25, bubbleScale: 1, reducedMotion: false }
  assert.deepEqual(store.apply(host), { ...host, bubbleScale: 0.8 })
  assert.equal(store.snapshot().scale, undefined)
  assert.equal(store.snapshot().bubbleScale.value, 0.8)
})

test('clearing a field drops its fallback and rewrites the file', () => {
  const file = join(makeDirectory('dsh-dafeiyu-user-settings-'), 'user-settings.json')
  const store = createUserSettingsStore(file)
  store.record({ scale: 0.8, reducedMotion: true }, { scale: 1, reducedMotion: false })

  store.clear(['scale'])
  assert.deepEqual(store.apply({ scale: 1, reducedMotion: false }), {
    scale: 1,
    reducedMotion: true,
  })
  const saved = JSON.parse(readFileSync(file, 'utf8'))
  assert.deepEqual(Object.keys(saved.overrides), ['reducedMotion'])
})

test('picking the host value again removes the stale override', () => {
  const file = join(makeDirectory('dsh-dafeiyu-user-settings-'), 'user-settings.json')
  const store = createUserSettingsStore(file)
  store.record({ scale: 0.8 }, { scale: 1 })
  store.record({ scale: 1 }, { scale: 1 })
  assert.deepEqual(store.snapshot(), {})
})

test('invalid fallback files and malformed entries are ignored', () => {
  const directory = makeDirectory('dsh-dafeiyu-user-settings-')
  const invalid = join(directory, 'invalid.json')
  writeFileSync(invalid, 'not json')
  assert.deepEqual(createUserSettingsStore(invalid).apply({ scale: 1 }), { scale: 1 })

  const malformed = join(directory, 'malformed.json')
  writeFileSync(malformed, JSON.stringify({
    overrides: {
      scale: { value: 'huge', host: 1 },
      bubbleScale: { value: 0.5, host: 1 },
      reducedMotion: { value: true, host: false },
    },
  }))
  const store = createUserSettingsStore(malformed)
  assert.deepEqual(store.apply({ scale: 1, bubbleScale: 1, reducedMotion: false }), {
    scale: 1,
    bubbleScale: 0.6,
    reducedMotion: true,
  })
})
