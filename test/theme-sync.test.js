import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

test('theme: THEME message kind is defined in protocol', async () => {
  const source = await readFile(new URL('../src/protocol.js', import.meta.url), 'utf8')
  assert.match(source, /THEME:\s*'theme'/, 'THEME kind should be defined')
})

test('theme: protocol validates THEME preference field', async () => {
  const source = await readFile(new URL('../src/protocol.js', import.meta.url), 'utf8')
  // Should have validation for theme preference
  assert.match(source, /themePreferences/, 'should define themePreferences set')
  assert.match(source, /light.*dark.*system/, 'should accept light/dark/system')
})

test('theme: THEME is included in snapshot message kinds', async () => {
  const source = await readFile(new URL('../src/helper-process.js', import.meta.url), 'utf8')
  assert.match(source, /snapshotMessageKinds[\s\S]*THEME/, 'THEME should be in snapshotMessageKinds')
})

test('theme: theme is remembered in snapshot for replay', async () => {
  const source = await readFile(new URL('../src/helper-process.js', import.meta.url), 'utf8')
  assert.match(source, /THEME[\s\S]*snapshot\.set\('theme'/, 'theme should be stored in snapshot')
})

test('theme: index.js listens to settings/updated for ui-theme', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
  assert.match(source, /settings\/updated/, 'should listen to settings/updated event')
  assert.match(source, /ui-theme/, 'should filter for ui-theme namespace')
  assert.match(source, /CompanionMessageKind\.THEME/, 'should send THEME message')
})

test('theme: initial theme is sent on bridge creation', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
  assert.match(source, /settings\.get\('ui-theme'\)/, 'should read initial theme from settings')
})

test('theme: helper.py validates theme preference', async () => {
  const source = await readFile(new URL('../runtime/helper.py', import.meta.url), 'utf8')
  assert.match(source, /THEME_PREFERENCES/, 'should define valid theme preferences')
  assert.match(source, /light.*dark.*system/, 'should accept light/dark/system')
})

test('theme: helper.py connects to QApplication signals', async () => {
  const source = await readFile(new URL('../runtime/helper.py', import.meta.url), 'utf8')
  assert.match(source, /paletteChanged\.connect/, 'should connect to paletteChanged signal')
  assert.match(source, /colorSchemeChanged\.connect/, 'should connect to colorSchemeChanged signal')
})

test('theme: macOS Swift helper handles theme messages', async () => {
  const source = await readFile(new URL('../native/macos/Sources/PetController.swift', import.meta.url), 'utf8')
  assert.match(source, /case "theme"/, 'should handle theme message')
  assert.match(source, /handleTheme/, 'should have handleTheme method')
  assert.match(source, /resolveTheme/, 'should resolve system theme')
})

test('theme: macOS listens for system theme changes', async () => {
  const source = await readFile(new URL('../native/macos/Sources/PetController.swift', import.meta.url), 'utf8')
  assert.match(source, /AppleInterfaceThemeChangedNotification/, 'should listen for macOS theme changes')
  assert.match(source, /effectiveAppearance/, 'should use effectiveAppearance for system theme')
})

test('theme: macOS uses dark colors in dark mode', async () => {
  const source = await readFile(new URL('../native/macos/Sources/PetController.swift', import.meta.url), 'utf8')
  assert.match(source, /themeResolved\s*==\s*"dark"/, 'should check for dark mode')
})

test('theme: protocol rejects invalid preference', async () => {
  const source = await readFile(new URL('../src/protocol.js', import.meta.url), 'utf8')
  // assertCompanionMessage should throw for invalid theme preference
  assert.match(source, /Unknown theme preference/, 'should throw for invalid preference')
})

test('theme: protocol accepts valid preferences', async () => {
  const source = await readFile(new URL('../src/protocol.js', import.meta.url), 'utf8')
  assert.match(source, /'light'/, 'should accept light')
  assert.match(source, /'dark'/, 'should accept dark')
  assert.match(source, /'system'/, 'should accept system')
})

test('theme: helper.py rejects unknown preference values', async () => {
  const source = await readFile(new URL('../runtime/helper.py', import.meta.url), 'utf8')
  assert.match(source, /unsupported theme preference/, 'should reject unknown preference')
})

test('theme: macOS handleTheme defaults to system', async () => {
  const source = await readFile(new URL('../native/macos/Sources/PetController.swift', import.meta.url), 'utf8')
  assert.match(source, /handleTheme.*\{/, 'should have handleTheme method')
  assert.match(source, /preference.*\?\?.*"system"/, 'should default to system')
})

test('theme: macOS systemThemeChanged ignores non-system preference', async () => {
  const source = await readFile(new URL('../native/macos/Sources/PetController.swift', import.meta.url), 'utf8')
  assert.match(source, /themePreference\s*!=\s*"system"/, 'should skip when not in system mode')
})

test('theme: Qt helper stops following system when explicit mode set', async () => {
  const source = await readFile(new URL('../runtime/helper.py', import.meta.url), 'utf8')
  assert.match(source, /theme_preference\s*!=\s*"system"/, 'should stop following system when explicit mode')
})

test('theme: cleanup unregisters theme listener on dispose', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
  assert.match(source, /offThemeUpdate\?\./, 'should cleanup theme listener on dispose')
})

test('theme: protocol encodeMessage validates THEME preference', async () => {
  const { createMessage, encodeMessage } = await import('../src/protocol.js')

  // Valid preferences should work
  assert.doesNotThrow(() => encodeMessage(createMessage('theme', { preference: 'light' })))
  assert.doesNotThrow(() => encodeMessage(createMessage('theme', { preference: 'dark' })))
  assert.doesNotThrow(() => encodeMessage(createMessage('theme', { preference: 'system' })))

  // Invalid preferences should throw
  assert.throws(() => encodeMessage(createMessage('theme', { preference: 'blue' })), TypeError)
  assert.throws(() => encodeMessage(createMessage('theme', { preference: '' })), TypeError)
  assert.throws(() => encodeMessage(createMessage('theme', {})), TypeError)
})

test('theme: initial theme sent after bridge start in mount', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
  // Initial theme should be sent after bridge.start() and bridge is available
  const bridgeStartIdx = source.indexOf('bridge.start()')
  const themeSendIdx = source.indexOf("CompanionMessageKind.THEME, { preference: themeSection.preference")
  assert.ok(bridgeStartIdx > 0, 'bridge.start() should exist')
  assert.ok(themeSendIdx > 0, 'initial theme send should exist')
  assert.ok(themeSendIdx > bridgeStartIdx, 'theme should be sent after bridge.start()')
})

test('theme: settings/updated defaults to system when preference missing', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
  assert.match(source, /next\?\.preference \?\? 'system'/, 'should default to system when preference missing')
})

test('theme: THEME message is coalescible', async () => {
  const source = await readFile(new URL('../src/helper-process.js', import.meta.url), 'utf8')
  // THEME should be in coalescibleMessageKinds (which spreads snapshotMessageKinds)
  const coalescibleMatch = source.match(/coalescibleMessageKinds\s*=\s*new Set\(\[([\s\S]*?)\]\)/)
  assert.ok(coalescibleMatch, 'coalescibleMessageKinds should be defined')
  // Since THEME is in snapshotMessageKinds, it's automatically in coalescibleMessageKinds via spread
  assert.match(coalescibleMatch[1], /\.\.\.snapshotMessageKinds/, 'should spread snapshotMessageKinds')
})
