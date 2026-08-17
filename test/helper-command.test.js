import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveHelperLaunch } from '../src/helper-process.js'

const bundledPath = '/package/runtime/bin/win32-x64/dsh-dafeiyu-helper.exe'
const helperPath = '/package/runtime/helper.py'

function resolve(overrides = {}) {
  return resolveHelperLaunch({
    platform: 'linux',
    isWslEnv: false,
    bundledPath,
    helperPath,
    fileExists: () => true,
    windowsPath: () => 'C:\\package\\runtime\\bin\\win32-x64\\dsh-dafeiyu-helper.exe',
    ...overrides,
  })
}

test('native Windows launches the bundled x64 helper directly', () => {
  assert.deepEqual(resolve({ platform: 'win32' }), { command: bundledPath, args: [] })
})

test('WSL visual mode uses cmd.exe so npm file modes cannot block the helper', () => {
  assert.deepEqual(resolve({ isWslEnv: true }), {
    command: 'cmd.exe',
    args: ['/d', '/c', 'C:\\package\\runtime\\bin\\win32-x64\\dsh-dafeiyu-helper.exe'],
  })
})

test('WSL headless mode stays on Linux Python for Linux event-log paths', () => {
  assert.deepEqual(resolve({ isWslEnv: true, headless: true }), {
    command: 'python3',
    args: [helperPath],
  })
})

test('ordinary Linux does not attempt Windows interop', () => {
  assert.deepEqual(resolve(), { command: 'python3', args: [helperPath] })
})

test('missing bundled helper falls back to the configured Python', () => {
  assert.deepEqual(resolve({
    isWslEnv: true,
    fileExists: () => false,
    pythonEnv: '/opt/dsh/python',
  }), {
    command: '/opt/dsh/python',
    args: [helperPath],
  })
})
