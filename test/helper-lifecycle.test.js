import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { HelperProcess, defaultCommand, isWsl, shouldUseBundledHelper } from '../src/helper-process.js'
import { CompanionMessageKind, CompanionState, createMessage } from '../src/protocol.js'

async function waitFor(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('timed out waiting for helper condition')
}

test('helper process exposes WSL detection helpers without throwing', () => {
  assert.equal(typeof isWsl(), 'boolean')
  assert.equal(typeof shouldUseBundledHelper(), 'boolean')
  assert.equal(typeof defaultCommand(), 'string')
  assert.equal(typeof defaultCommand(true), 'string')
})

test('helper consumes events and exits when the plugin stops', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-dafeiyu-test-'))
  const eventLog = join(directory, 'events.jsonl')
  const logger = { debug() {}, info() {}, warn() {}, error() {} }
  const bridge = new HelperProcess({ headless: true, eventLog }, logger)
  const child = bridge.start()
  const exited = new Promise((resolve, reject) => {
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`helper exited with ${String(code)}`)))
    child.once('error', reject)
  })
  bridge.send(createMessage(CompanionMessageKind.STATE, {
    state: CompanionState.WORKING,
    message: 'running a test',
  }))
  bridge.stop('test-complete')
  await exited

  const messages = (await readFile(eventLog, 'utf8')).trim().split(/\r?\n/).map(JSON.parse)
  assert.equal(messages[0].state, CompanionState.WORKING)
  assert.equal(messages.at(-1).kind, CompanionMessageKind.SHUTDOWN)
  await rm(directory, { recursive: true, force: true })
})

test('helper heartbeat stays healthy and responds without a restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-dafeiyu-heartbeat-'))
  const eventLog = join(directory, 'events.jsonl')
  const logger = { debug() {}, info() {}, warn() {}, error() {} }
  const bridge = new HelperProcess({
    headless: true,
    eventLog,
    heartbeatMs: 25,
    heartbeatTimeoutMs: 150,
  }, logger)
  const initialChild = bridge.start()
  bridge.send(createMessage(CompanionMessageKind.STATE, {
    state: CompanionState.THINKING,
    message: 'heartbeat test',
  }))
  await waitFor(async () => {
    try {
      return (await readFile(eventLog, 'utf8')).includes('"kind": "ping"')
    } catch {
      return false
    }
  })
  await new Promise((resolve) => setTimeout(resolve, 220))
  assert.equal(bridge.child, initialChild)
  bridge.stop('heartbeat-test-complete')
  await waitFor(async () => {
    try {
      return (await readFile(eventLog, 'utf8')).includes('"kind": "shutdown"')
    } catch {
      return false
    }
  })
  await rm(directory, { recursive: true, force: true })
})

test('desktop context-menu settings reach the host settings callback', async () => {
  const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'settings-helper.js')
  const logger = { debug() {}, info() {}, warn() {}, error() {} }
  let reported
  const bridge = new HelperProcess({
    command: process.execPath,
    args: [fixture],
    headless: false,
    heartbeatMs: 0,
    onSettingsChange: (settings) => { reported = settings },
  }, logger)
  const child = bridge.start()
  const exited = new Promise((resolve, reject) => {
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`helper exited with ${String(code)}`)))
    child.once('error', reject)
  })
  bridge.send(createMessage(CompanionMessageKind.STATE, {
    state: CompanionState.IDLE,
    message: 'trigger settings report',
  }))
  await waitFor(() => reported !== undefined)
  assert.equal(reported.scale, 0.6)
  assert.equal(reported.bubbleScale, 0.9)
  assert.equal(reported.reducedMotion, true)
  bridge.stop('settings-test-complete')
  await exited
})
