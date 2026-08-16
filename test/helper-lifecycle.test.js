import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { HelperProcess } from '../src/helper-process.js'
import { CompanionMessageKind, CompanionState, createMessage } from '../src/protocol.js'

// WSL interop spawns the onefile exe through a cold PyInstaller extraction
// (3s+ for the bundled build), so keep the default poll window generous.
async function waitFor(predicate, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('timed out waiting for helper condition')
}

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
