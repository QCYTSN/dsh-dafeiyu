import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  cacheWslBundledHelper,
  defaultCmdExe,
  defaultWindowsLocalAppData,
  resolveHelperLaunch,
} from '../src/helper-process.js'

const bundledPath = '/package/runtime/bin/win32-x64/dsh-dafeiyu-helper.exe'
const linuxBundledPath = '/package/runtime/bin/linux-x64/dsh-dafeiyu-helper'
const darwinBundledPath = '/package/runtime/bin/darwin/dsh-dafeiyu-helper.app/Contents/MacOS/dsh-dafeiyu-helper'
const helperPath = '/package/runtime/helper.py'

function resolve(overrides = {}) {
  return resolveHelperLaunch({
    platform: 'linux',
    isWslEnv: false,
    bundledPath,
    linuxBundledPath,
    darwinBundledPath,
    helperPath,
    fileExists: () => true,
    windowsPath: () => 'C:\\package\\runtime\\bin\\win32-x64\\dsh-dafeiyu-helper.exe',
    wslHelperCache: ({ bundledPath: source }) => source,
    ...overrides,
  })
}

test('native Windows launches the bundled x64 helper directly', () => {
  assert.deepEqual(resolve({ platform: 'win32' }), { command: bundledPath, args: [] })
})

test('native macOS launches the bundled universal helper directly', () => {
  assert.deepEqual(resolve({ platform: 'darwin' }), {
    command: darwinBundledPath,
    args: [],
  })
})

test('macOS falls back to configured Python when its bundle is absent', () => {
  assert.deepEqual(resolve({
    platform: 'darwin',
    fileExists: () => false,
    pythonEnv: '/opt/dsh/python',
  }), {
    command: '/opt/dsh/python',
    args: [helperPath],
  })
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

test('WSL visual mode launches the Windows-local cached helper instead of the UNC source', () => {
  let convertedPath
  const cachedPath = '/mnt/c/Users/test/AppData/Local/dsh-dafeiyu/0.1.5/dsh-dafeiyu-helper.exe'
  assert.deepEqual(resolve({
    isWslEnv: true,
    cmdExe: () => '/mnt/c/Windows/System32/cmd.exe',
    wslHelperCache: () => cachedPath,
    windowsPath: (path) => {
      convertedPath = path
      return 'C:\\Users\\test\\AppData\\Local\\dsh-dafeiyu\\0.1.5\\dsh-dafeiyu-helper.exe'
    },
  }), {
    command: '/mnt/c/Windows/System32/cmd.exe',
    args: ['/d', '/c', 'C:\\Users\\test\\AppData\\Local\\dsh-dafeiyu\\0.1.5\\dsh-dafeiyu-helper.exe'],
  })
  assert.equal(convertedPath, cachedPath)
})

test('WSL visual mode falls back to the packaged helper when caching fails', () => {
  let convertedPath
  resolve({
    isWslEnv: true,
    wslHelperCache: () => { throw new Error('cache unavailable') },
    windowsPath: (path) => {
      convertedPath = path
      return 'C:\\package\\runtime\\bin\\win32-x64\\dsh-dafeiyu-helper.exe'
    },
  })
  assert.equal(convertedPath, bundledPath)
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

test('defaultWindowsLocalAppData resolves LOCALAPPDATA back to a WSL mount path', () => {
  const calls = []
  const localPath = defaultWindowsLocalAppData({
    cmdExe: () => 'cmd.exe',
    run: (command, args) => {
      assert.equal(command, 'cmd.exe')
      assert.deepEqual(args, ['/d', '/c', 'echo %LOCALAPPDATA%'])
      return 'C:\\Users\\peanut\\AppData\\Local\r\n'
    },
    wslpath: (...args) => {
      calls.push(args)
      return '/mnt/c/Users/test/AppData/Local'
    },
  })
  assert.equal(localPath, '/mnt/c/Users/test/AppData/Local')
  assert.deepEqual(calls, [['-u', 'C:\\Users\\peanut\\AppData\\Local']])
})

test('cacheWslBundledHelper copies once into a versioned Windows-local cache', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-dafeiyu-wsl-cache-'))
  const source = join(root, 'package', 'dsh-dafeiyu-helper.exe')
  const localAppData = join(root, 'windows-local')
  mkdirSync(join(root, 'package'), { recursive: true })
  writeFileSync(source, 'helper-binary')

  let copies = 0
  const copyFile = (from, to) => {
    copies += 1
    writeFileSync(to, readFileSync(from))
  }
  const first = cacheWslBundledHelper({
    bundledPath: source,
    version: '0.1.5',
    localAppData: () => localAppData,
    copyFile,
  })
  const second = cacheWslBundledHelper({
    bundledPath: source,
    version: '0.1.5',
    localAppData: () => localAppData,
    copyFile,
  })

  assert.equal(first, second)
  assert.match(first.replaceAll('\\', '/'), /windows-local\/dsh-dafeiyu\/0\.1\.5\/dsh-dafeiyu-helper-13\.exe$/)
  assert.equal(readFileSync(first, 'utf8'), 'helper-binary')
  assert.equal(copies, 1)
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
