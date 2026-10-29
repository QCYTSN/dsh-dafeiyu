import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  cleanStaleExtractionDirectories,
  defaultHelperTempDirectory,
  HelperProcess,
} from '../src/helper-process.js'
import { createHelperLog, defaultHelperLogPath } from '../src/helper-log.js'

function makeDirectory(prefix) {
  return mkdtempSync(join(tmpdir(), prefix))
}

async function waitFor(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('timed out waiting for helper diagnostics')
}

function readLog(file) {
  return readFileSync(file, 'utf8')
}

// path.join uses the host separator, so compare simulated platforms with
// forward slashes on every OS.
function slashed(value) {
  return value?.replaceAll('\\', '/')
}

test('default Helper log lives under the platform log directory', () => {
  assert.equal(
    slashed(defaultHelperLogPath({
      platform: 'win32', home: 'C:\\Users\\me', env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' },
    })),
    'C:/Users/me/AppData/Local/dsh-dafeiyu/logs/helper.log',
  )
  assert.equal(
    slashed(defaultHelperLogPath({ platform: 'darwin', home: '/Users/me', env: {} })),
    '/Users/me/Library/Logs/dsh-dafeiyu/helper.log',
  )
  assert.equal(
    slashed(defaultHelperLogPath({ platform: 'linux', home: '/home/me', env: { XDG_STATE_HOME: '/state' } })),
    '/state/dsh-dafeiyu/helper.log',
  )
  assert.equal(
    slashed(defaultHelperLogPath({ platform: 'linux', home: '/home/me', env: { DSH_DAFEIYU_LOG_FILE: '/custom/helper.log' } })),
    slashed(resolve('/custom/helper.log')),
  )
  assert.equal(
    defaultHelperLogPath({ platform: 'linux', home: '/home/me', env: { DSH_DAFEIYU_LOG_FILE: 'off' } }),
    undefined,
  )
})

test('Helper temp directory is per application and absent on macOS', () => {
  assert.equal(
    slashed(defaultHelperTempDirectory({
      platform: 'win32', home: 'C:\\Users\\me', env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' },
    })),
    'C:/Users/me/AppData/Local/dsh-dafeiyu/tmp',
  )
  assert.equal(
    slashed(defaultHelperTempDirectory({ platform: 'linux', home: '/home/me', env: { XDG_CACHE_HOME: '/cache' } })),
    '/cache/dsh-dafeiyu/tmp',
  )
  assert.equal(defaultHelperTempDirectory({ platform: 'darwin', home: '/Users/me', env: {} }), undefined)
})

test('stale PyInstaller extraction directories are reclaimed, live ones are kept', () => {
  const directory = makeDirectory('dsh-dafeiyu-temp-')
  const stale = join(directory, '_MEI111111')
  const recent = join(directory, '_MEI222222')
  const unrelated = join(directory, 'assets')
  mkdirSync(stale)
  mkdirSync(recent)
  mkdirSync(unrelated)
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  utimesSync(stale, twoDaysAgo, twoDaysAgo)

  const removed = cleanStaleExtractionDirectories(directory)

  assert.deepEqual(removed, [stale])
  assert.equal(existsSync(stale), false)
  assert.equal(existsSync(recent), true)
  assert.equal(existsSync(unrelated), true)
})

test('a helper log records failures instead of leaving a silent missing pet', async () => {
  const directory = makeDirectory('dsh-dafeiyu-log-')
  const logFile = join(directory, 'helper.log')
  const logger = { debug() {}, info() {}, warn() {}, error() {} }
  const bridge = new HelperProcess({
    command: process.execPath,
    args: ['-e', 'process.stdin.resume(); setTimeout(() => process.exit(17), 10)'],
    heartbeatMs: 0,
    restartDelayMs: 10,
    maxStartFailures: 1,
    logFile,
  }, logger)

  bridge.start()
  await waitFor(() => bridge.restartSuppressed === true)
  bridge.stop('log-test-complete')

  const log = readLog(logFile)
  assert.match(log, /Helper diagnostics: plugin=\d+\.\d+\.\d+/)
  assert.match(log, /start attempt 1:/)
  assert.match(log, /spawned pid=\d+/)
  assert.match(log, /exited before ready \(code=17/)
  assert.match(log, /giving up after 1 failed starts/)
})

test('a readiness timeout is reported with its configured budget', async () => {
  const directory = makeDirectory('dsh-dafeiyu-timeout-')
  const logFile = join(directory, 'helper.log')
  const logger = { debug() {}, info() {}, warn() {}, error() {} }
  const bridge = new HelperProcess({
    command: process.execPath,
    args: ['-e', 'setInterval(() => {}, 1000)'],
    heartbeatMs: 0,
    restartDelayMs: 10,
    startupTimeoutMs: 60,
    maxStartFailures: 1,
    logFile,
  }, logger)

  bridge.start()
  await waitFor(() => bridge.restartSuppressed === true)
  bridge.stop('timeout-test-complete')

  assert.match(readLog(logFile), /readiness timed out after 60ms; killing helper pid=\d+/)
})

test('the first Helper start uses the cold-start budget, not the old 60s one', async () => {
  const directory = makeDirectory('dsh-dafeiyu-cold-')
  const logFile = join(directory, 'helper.log')
  const logger = { debug() {}, info() {}, warn() {}, error() {} }
  const bridge = new HelperProcess({
    command: process.execPath,
    args: ['-e', 'process.stdin.resume(); setTimeout(() => process.exit(0), 30)'],
    heartbeatMs: 0,
    restartDelayMs: 10,
    maxStartFailures: 1,
    logFile,
  }, logger)

  bridge.start()
  await waitFor(() => readLog(logFile).includes('start attempt 1'))
  bridge.stop('cold-timeout-test-complete')

  assert.match(readLog(logFile), /startupTimeoutMs=180000/)
})

test('the Helper child receives the per-application temp directory', async () => {
  const directory = makeDirectory('dsh-dafeiyu-child-temp-')
  const logFile = join(directory, 'helper.log')
  const childTemp = join(directory, 'tmp')
  const logger = { debug() {}, info() {}, warn() {}, error() {} }
  const bridge = new HelperProcess({
    command: process.execPath,
    args: ['-e', 'console.error(process.env.TEMP + "|" + process.env.TMPDIR); setTimeout(() => process.exit(0), 30)'],
    heartbeatMs: 0,
    restartDelayMs: 10,
    maxStartFailures: 1,
    logFile,
    tempDirectory: childTemp,
  }, logger)

  bridge.start()
  await waitFor(() => bridge.restartSuppressed === true)
  bridge.stop('child-temp-test-complete')

  assert.ok(existsSync(childTemp))
  assert.match(readLog(logFile), new RegExp(`${childTemp.replaceAll('\\', '\\\\')}\\|${childTemp.replaceAll('\\', '\\\\')}`))
})

test('a Python fallback without PySide6 logs an actionable hint', async () => {
  const directory = makeDirectory('dsh-dafeiyu-python-hint-')
  const logFile = join(directory, 'helper.log')
  const errors = []
  const logger = { debug() {}, info() {}, warn() {}, error(message) { errors.push(message) } }
  const bridge = new HelperProcess({
    command: process.execPath,
    args: ['-e', 'console.error("ModuleNotFoundError: No module named \\"PySide6\\""); setTimeout(() => process.exit(1), 20)'],
    heartbeatMs: 0,
    restartDelayMs: 10,
    maxStartFailures: 1,
    logFile,
  }, logger)

  bridge.start()
  await waitFor(() => bridge.restartSuppressed === true)
  bridge.stop('python-hint-test-complete')

  const log = readLog(logFile)
  assert.match(log, /ModuleNotFoundError: No module named "PySide6"/)
  assert.match(log, /fell back to the Python Helper but PySide6 is unavailable/)
  assert.ok(errors.some((message) => message.includes('PySide6')))
})

test('the real Python visual fallback reports how to install missing PySide6', async () => {
  const directory = makeDirectory('dsh-dafeiyu-real-python-hint-')
  const logFile = join(directory, 'helper.log')
  const errors = []
  const logger = { debug() {}, info() {}, warn() {}, error(message) { errors.push(message) } }
  const bridge = new HelperProcess({
    command: process.execPath,
    // -S excludes site-packages even on machines with PySide6 installed. Run
    // the actual Helper so its caught ImportError wording cannot drift away
    // from the Host's diagnostic matcher unnoticed.
    args: [
      fileURLToPath(new URL('../scripts/run-python.mjs', import.meta.url)),
      '-S',
      fileURLToPath(new URL('../runtime/helper.py', import.meta.url)),
    ],
    heartbeatMs: 0,
    restartDelayMs: 10,
    maxStartFailures: 1,
    logFile,
  }, logger)

  try {
    bridge.start()
    await waitFor(() => bridge.restartSuppressed === true)
    const log = readLog(logFile)
    assert.match(log, /PySide6 is required for visual mode/)
    assert.match(log, /fell back to the Python Helper but PySide6 is unavailable/)
    assert.ok(errors.some((message) => message.includes('Install "PySide6>=6.7,<7"')))
  } finally {
    bridge.stop('real-python-hint-test-complete')
  }
})

test('creating a log directory is best effort and never throws', () => {
  const log = createHelperLog(join(makeDirectory('dsh-dafeiyu-log-'), 'nested', 'deeper', 'helper.log'))
  assert.doesNotThrow(() => log.write('INFO', 'hello'))
  assert.doesNotThrow(() => createHelperLog(undefined).write('INFO', 'ignored'))
})

test('a log is rotated once it exceeds one megabyte', () => {
  const directory = makeDirectory('dsh-dafeiyu-rotate-')
  const logFile = join(directory, 'helper.log')
  writeFileSync(logFile, 'x'.repeat(1024 * 1024 + 1))

  createHelperLog(logFile).write('INFO', 'fresh entry')

  assert.equal(readFileSync(`${logFile}.1`, 'utf8').length, 1024 * 1024 + 1)
  assert.match(readFileSync(logFile, 'utf8'), /fresh entry/)
})
