import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const assetRoot = join(repositoryRoot, 'assets')

test('package files whitelist ships the glove cursors and their sources', async () => {
  const pkg = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'))
  for (const entry of ['assets/cursor_grab.cur', 'assets/cursor_grabbing.cur', 'assets/cursors/']) {
    assert.ok(pkg.files.includes(entry), `package.json "files" is missing ${entry}`)
  }
})

test('glove cursor files are valid 32x32 CUR icons', async () => {
  for (const name of ['cursor_grab.cur', 'cursor_grabbing.cur']) {
    const bytes = await readFile(join(assetRoot, name))
    assert.deepEqual([...bytes.subarray(0, 4)], [0, 0, 2, 0], `${name} is not a CUR (ICONDIR header)`)
    assert.equal(bytes[6], 32, `${name} width must be 32`)
    assert.equal(bytes[7], 32, `${name} height must be 32`)
  }
})

test('glove cursor sources, converter and license text are present', async () => {
  for (const name of [
    'cursors/openhand.32.xpm',
    'cursors/closedhand.32.xpm',
    'cursors/xpm2cur.py',
    'cursors/README.md',
    'cursors/GPL-3.0.txt',
  ]) {
    const info = await stat(join(assetRoot, name))
    assert.ok(info.size > 0, `${name} is empty`)
  }
})
