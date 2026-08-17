import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CompanionMessageKind,
  CompanionState,
  assertCompanionMessage,
  createMessage,
  encodeMessage,
} from '../src/protocol.js'

test('protocol creates and encodes a valid state message', () => {
  const message = createMessage(CompanionMessageKind.STATE, { state: CompanionState.WORKING })
  assert.equal(assertCompanionMessage(message), message)
  assert.deepEqual(JSON.parse(encodeMessage(message)), message)
})

test('protocol rejects unknown states', () => {
  const message = createMessage(CompanionMessageKind.STATE, { state: 'DANCING' })
  assert.throws(() => assertCompanionMessage(message), /Unknown companion state/)
})

test('protocol accepts the helper readiness handshake', () => {
  const message = createMessage(CompanionMessageKind.READY)
  assert.equal(assertCompanionMessage(message).kind, 'ready')
})

test('protocol creates and encodes a multi-task message', () => {
  const message = createMessage(CompanionMessageKind.TASKS, {
    tasks: [
      { sessionId: 'one', state: CompanionState.WORKING, project: 'demo', task: 'write code' },
      { sessionId: 'two', state: CompanionState.WAITING, project: 'demo', task: 'confirm' },
    ],
  })
  assert.equal(assertCompanionMessage(message), message)
  assert.deepEqual(JSON.parse(encodeMessage(message)), message)
})

test('protocol creates and encodes a live config message', () => {
  const message = createMessage(CompanionMessageKind.CONFIG, {
    scale: 0.9,
    bubbleScale: 0.7,
    activityLevel: 'quiet',
    reducedMotion: true,
  })
  assert.equal(assertCompanionMessage(message), message)
  assert.deepEqual(JSON.parse(encodeMessage(message)), message)
})
