import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultCmdExe, resolveHelperLaunch } from '../src/helper-process.js'

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

test('WSL visual mode uses an absolute cmd.exe path, not the bare name on PATH', () => {
  // cmd.exe is typically not on the WSL PATH; the plugin must use the Windows
  // absolute path resolved through wslpath so it works on every WSL install.
  assert.deepEqual(resolve({ isWslEnv: true, cmdExe: () => '/mnt/c/Windows/System32/cmd.exe' }), {
    command: '/mnt/c/Windows/System32/cmd.exe',
    args: ['/d', '/c', 'C:\\package\\runtime\\bin\\win32-x64\\dsh-dafeiyu-helper.exe'],
  })
})

test('WSL visual mode falls back to the bare cmd.exe if the absolute path cannot be resolved', () => {
  assert.deepEqual(resolve({ isWslEnv: true, cmdExe: () => 'cmd.exe' }), {
    command: 'cmd.exe',
    args: ['/d', '/c', 'C:\\package\\runtime\\bin\\win32-x64\\dsh-dafeiyu-helper.exe'],
  })
})

test('defaultCmdExe resolves the absolute Windows cmd.exe via wslpath when it exists', () => {
  const resolved = defaultCmdExe({
    wslpath: () => '/mnt/c/Windows/System32/cmd.exe',
    fileExists: () => true,
  })
  assert.equal(resolved, '/mnt/c/Windows/System32/cmd.exe')
})

test('defaultCmdExe falls back to the bare cmd.exe when wslpath cannot resolve it', () => {
  assert.equal(defaultCmdExe({
    wslpath: () => { throw new Error('wslpath missing') },
    fileExists: () => true,
  }), 'cmd.exe')
})

test('WSL headless mode uses the Linux helper so event-log paths stay on Linux', () => {
  assert.deepEqual(resolve({ isWslEnv: true, headless: true }), {
    command: linuxBundledPath,
    args: [],
  })
})

test('ordinary Linux launches the bundled Linux helper', () => {
  assert.deepEqual(resolve(), { command: linuxBundledPath, args: [] })
})

test('ordinary Linux falls back to Python when its bundled helper is absent', () => {
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
