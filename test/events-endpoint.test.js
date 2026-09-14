import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { EVENTS_ENDPOINT, createEventStream, createEventsHandler } from '../src/index.js'

function fakeRes() {
  const chunks = []
  return {
    chunks,
    statusCode: 0,
    headers: undefined,
    writeHead(status, headers) {
      this.statusCode = status
      this.headers = headers
    },
    write(chunk) {
      chunks.push(chunk)
    },
    end() {
      chunks.push('[end]')
    },
  }
}

function fakeReq(address = '127.0.0.1', host = '127.0.0.1:3080', origin) {
  const req = new EventEmitter()
  req.socket = { remoteAddress: address }
  req.headers = { host, ...(origin ? { origin } : {}) }
  return req
}

test('event endpoint is declared on the plugin namespace', () => {
  assert.equal(EVENTS_ENDPOINT, '/plugins/dsh-dafeiyu/events')
})

test('event stream rejects non-loopback and cross-origin requests', () => {
  const stream = createEventStream()
  const handler = createEventsHandler(stream)

  const foreign = fakeRes()
  handler(fakeReq('203.0.113.7'), foreign)
  assert.equal(foreign.statusCode, 403)

  const crossOrigin = fakeRes()
  handler(fakeReq('127.0.0.1', '127.0.0.1:3080', 'https://evil.example'), crossOrigin)
  assert.equal(crossOrigin.statusCode, 403)
  assert.equal(stream.clientCount, 0)
})

test('event stream opens SSE, replays the snapshot, and broadcasts live messages', () => {
  const stream = createEventStream()
  const handler = createEventsHandler(stream)

  stream.broadcast({ protocolVersion: 1, kind: 'state', state: 'WORKING' })
  stream.broadcast({ protocolVersion: 1, kind: 'pulse', state: 'SUCCESS' })

  const req = fakeReq('127.0.0.1')
  const res = fakeRes()
  handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.match(res.headers['content-type'], /text\/event-stream/)
  const body = res.chunks.join('')
  assert.match(body, /retry: 2000/)
  // Snapshot kinds replay on connect; transient pulses do not.
  assert.match(body, /"kind":"state"[^]*"state":"WORKING"/)
  assert.doesNotMatch(body, /pulse/)

  stream.broadcast({ protocolVersion: 1, kind: 'state', state: 'IDLE' })
  assert.match(res.chunks.at(-1), /"state":"IDLE"/)
  assert.equal(stream.clientCount, 1)

  req.emit('close')
  assert.equal(stream.clientCount, 0)
  const after = fakeRes()
  stream.broadcast({ protocolVersion: 1, kind: 'state', state: 'ERROR' })
  assert.equal(after.chunks.length, 0)
})

test('event stream drops dead subscribers instead of throwing', () => {
  const stream = createEventStream()
  const broken = fakeRes()
  broken.write = () => {
    throw new Error('connection reset')
  }
  stream.add(broken)
  const healthy = fakeRes()
  stream.add(healthy)
  stream.broadcast({ protocolVersion: 1, kind: 'hello', host: 'deepseek-harness' })
  assert.equal(stream.clientCount, 1)
  assert.match(healthy.chunks.at(-1), /"kind":"hello"/)
})
