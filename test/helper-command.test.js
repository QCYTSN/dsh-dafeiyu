import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveHelperLaunch } from '../src/helper-process.js'

const bundledPath = '/package/runtime/bin/win32-x64/dsh-dafeiyu-helper.exe'
const linuxBundledPath = '/package/runtime/bin/linux-x64/dsh-dafeiyu-helper'
const helperPath = '/package/runtime/helper.py'

function resolve(overrides = {}) {
  return resolveHelperLaunch({
    platform: 'linux',
    isWslEnv: false,
    bundledPath,
    linuxBundledPath,
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

test('WSL headless mode uses the Linux helper so event-log paths stay on Linux', () => {
  assert.deepEqual(resolve({ isWslEnv: true, headless: true }), {
    command: linuxBundledPath,
    args: [],
  })
})

test('ordinary Linux launches the bundled linux helper', () => {
  assert.deepEqual(resolve(), { command: linuxBundledPath, args: [] })
})

test('ordinary Linux does not attempt Windows interop when the linux helper is absent', () => {
  assert.deepEqual(resolve({
    fileExists: (path) => path !== linuxBundledPath,
  }), { command: 'python3', args: [helperPath] })
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
