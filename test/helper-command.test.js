import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { resolveHelperCommand } from '../src/helper-process.js'

async function makeFile(mode) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-dafeiyu-cmd-'))
  const path = join(directory, 'dsh-dafeiyu-helper.exe')
  await writeFile(path, 'fake helper')
  if (mode !== undefined) await chmod(path, mode)
  return { directory, path }
}

test('win32 uses the bundled exe whenever it exists (exec bit is a Linux concept)', async () => {
  const { directory, path } = await makeFile(0o644)
  assert.equal(resolveHelperCommand({ platform: 'win32', isWslEnv: false, bundledPath: path }), path)
  await rm(directory, { recursive: true, force: true })
})

test('non-WSL linux always falls back to python3', async () => {
  const { directory, path } = await makeFile(0o755)
  assert.equal(resolveHelperCommand({ platform: 'linux', isWslEnv: false, bundledPath: path }), 'python3')
  await rm(directory, { recursive: true, force: true })
})

test('WSL uses the bundled exe when it carries the executable bit', async () => {
  const { directory, path } = await makeFile(0o755)
  assert.equal(resolveHelperCommand({ platform: 'linux', isWslEnv: true, bundledPath: path }), path)
  await rm(directory, { recursive: true, force: true })
})

test('WSL falls back to python3 when the bundled exe is not executable', async () => {
  const { directory, path } = await makeFile(0o644)
  assert.equal(resolveHelperCommand({ platform: 'linux', isWslEnv: true, bundledPath: path }), 'python3')
  await rm(directory, { recursive: true, force: true })
})

test('WSL falls back to python3 when the bundled exe is missing', async () => {
  assert.equal(resolveHelperCommand({ platform: 'linux', isWslEnv: true, bundledPath: '/definitely/missing.exe' }), 'python3')
})

test('DSH_DAFEIYU_PYTHON override wins over every fallback', async () => {
  assert.equal(resolveHelperCommand({ platform: 'linux', isWslEnv: true, bundledPath: '/missing.exe', pythonEnv: '/opt/python/bin/python3' }), '/opt/python/bin/python3')
})
