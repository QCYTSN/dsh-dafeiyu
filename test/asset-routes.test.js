import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { createAssetRoutes } from '../src/index.js'

function fakeRes() {
  return {
    statusCode: 0,
    headers: undefined,
    body: undefined,
    writeHead(status, headers) {
      this.statusCode = status
      this.headers = headers
    },
    end(payload) {
      this.body = payload
    },
  }
}

function fakeReq(url, address = '127.0.0.1') {
  const req = new EventEmitter()
  req.url = url
  req.socket = { remoteAddress: address }
  req.headers = { host: '127.0.0.1:3080' }
  return req
}

test('asset routes serve manifest-declared frames only', async () => {
  const routes = createAssetRoutes()
  assert.ok(routes, 'routes should load from the real package manifest')

  const ok = fakeRes()
  routes.frameHandler(fakeReq('/plugins/dsh-dafeiyu/frame?frame=idle/idle_001.webp'), ok)
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.headers['content-type'], 'image/webp')
  assert.ok(ok.body.length > 100)

  const unknown = fakeRes()
  routes.frameHandler(fakeReq('/plugins/dsh-dafeiyu/frame?frame=idle/nope.webp'), unknown)
  assert.equal(unknown.statusCode, 404)

  const traversal = fakeRes()
  routes.frameHandler(fakeReq('/plugins/dsh-dafeiyu/frame?frame=../../package.json'), traversal)
  assert.equal(traversal.statusCode, 404, 'paths outside the manifest allowlist must never resolve')

  const missing = fakeRes()
  routes.frameHandler(fakeReq('/plugins/dsh-dafeiyu/frame'), missing)
  assert.equal(missing.statusCode, 404)
})

test('asset routes stay loopback-only and serve the manifest', () => {
  const routes = createAssetRoutes()

  const foreign = fakeRes()
  routes.frameHandler(fakeReq('/plugins/dsh-dafeiyu/frame?frame=idle/idle_001.webp', '203.0.113.7'), foreign)
  assert.equal(foreign.statusCode, 403)

  const manifest = fakeRes()
  routes.manifestHandler(fakeReq('/plugins/dsh-dafeiyu/manifest'), manifest)
  assert.equal(manifest.statusCode, 200)
  const value = JSON.parse(manifest.body)
  assert.equal(value.formatVersion, 1)
  assert.ok(Object.keys(value.clips).length >= 15)
})
