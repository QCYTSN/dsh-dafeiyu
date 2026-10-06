import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveClientTarget } from '../src/client-target.js'

test('desktop profile and packaged host open the owning desktop app', () => {
  for (const runtime of [
    { cwd: () => 'C:\\Users\\owner\\.dsh\\profiles\\desktop', argv: [], env: {} },
    { cwd: () => '/tmp', argv: ['/app/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js'], env: {} },
  ]) assert.equal(resolveClientTarget({}, runtime).url, 'dsh://open')
})

test('web and manual target overrides keep the correct client and URL', () => {
  const runtime = { cwd: () => '/home/owner/.dsh/profiles/web', argv: [], env: {} }
  assert.equal(resolveClientTarget({}, runtime).url, 'http://127.0.0.1:3080/')
  assert.equal(resolveClientTarget({ clientTarget: 'desktop' }, runtime).label, '打开 DSH 桌面端')
  assert.equal(resolveClientTarget({ webuiUrl: 'http://127.0.0.1:4080/' }, runtime).url, 'http://127.0.0.1:4080/')
})
