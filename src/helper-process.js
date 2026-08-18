import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import {
  CompanionMessageKind,
  createMessage,
  encodeMessage,
} from './protocol.js'

const here = dirname(fileURLToPath(import.meta.url))
const defaultHelperPath = resolve(here, '..', 'runtime', 'helper.py')
const bundledHelperPath = resolve(here, '..', 'runtime', 'bin', 'win32-x64', 'dsh-dafeiyu-helper.exe')
const linuxBundledHelperPath = resolve(here, '..', 'runtime', 'bin', 'linux-x64', 'dsh-dafeiyu-helper')

function isWsl() {
  if (process.platform !== 'linux') return false
  try {
    return readFileSync('/proc/sys/fs/binfmt_misc/WSLInterop', 'utf8').includes('enabled')
  } catch {
    try {
      return /microsoft/i.test(readFileSync('/proc/version', 'utf8'))
    } catch {
      return false
    }
  }
}

function isBundledHelperCommand(command) {
  if (!command) return false
  const base = String(command).replaceAll('\\', '/').split('/').pop()
  return base === 'dsh-dafeiyu-helper' || base === 'dsh-dafeiyu-helper.exe'
}

function ensureExecutable(filePath) {
  try {
    chmodSync(filePath, 0o755)
  } catch {
    // Best-effort: npm packs created on Windows often lack the execute bit.
  }
}

function shouldUseBundledHelper() {
  if (process.platform === 'win32') return existsSync(bundledHelperPath)
  if (isWsl()) return existsSync(bundledHelperPath)
  if (process.platform === 'linux') return existsSync(linuxBundledHelperPath)
  return false
}

function toWindowsPath(path) {
  return execFileSync('wslpath', ['-w', path], { encoding: 'utf8' }).trim()
}

function resolveHelperLaunch({
  platform,
  isWslEnv,
  bundledPath,
  linuxBundledPath = linuxBundledHelperPath,
  helperPath,
  pythonEnv,
  headless = false,
  fileExists = existsSync,
  windowsPath = toWindowsPath,
}) {
  if (platform === 'win32' && fileExists(bundledPath)) {
    return { command: bundledPath, args: [] }
  }
  if (platform === 'linux' && isWslEnv && !headless && fileExists(bundledPath)) {
    // npm archives created on Windows store ordinary files as 0644. Launching
    // the EXE directly from WSL can therefore fail with EACCES. cmd.exe opens
    // the Windows path without relying on the Linux executable bit and keeps
    // stdin/stdout attached for the companion protocol.
    return {
      command: 'cmd.exe',
      args: ['/d', '/c', windowsPath(bundledPath)],
    }
  }
  if (platform === 'linux' && linuxBundledPath && fileExists(linuxBundledPath)) {
    return { command: linuxBundledPath, args: [] }
  }
  const command = pythonEnv || (platform === 'win32' ? 'py' : 'python3')
  return { command, args: defaultArgs(command, helperPath) }
}

function defaultLaunch(headless = false) {
  return resolveHelperLaunch({
    platform: process.platform,
    isWslEnv: isWsl(),
    bundledPath: bundledHelperPath,
    linuxBundledPath: linuxBundledHelperPath,
    helperPath: defaultHelperPath,
    pythonEnv: process.env.DSH_DAFEIYU_PYTHON,
    headless,
  })
}

function defaultCommand(headless = false) {
  return defaultLaunch(headless).command
}

function defaultArgs(command, helperPath) {
  if (isBundledHelperCommand(command)) return []
  if (process.platform === 'win32' && /(^|[\\/])py(?:\.exe)?$/i.test(command)) {
    return ['-3', helperPath]
  }
  return [helperPath]
}

export class HelperProcess {
  constructor(options = {}, logger = console) {
    this.options = options
    this.logger = logger
    this.child = undefined
    this.queue = []
    this.snapshot = new Map()
    this.spawned = false
    this.hasEverSpawned = false
    this.stopping = false
    this.restartSuppressed = false
    this.restartTimer = undefined
    this.heartbeatTimer = undefined
    this.startupTimer = undefined
    this.lastPongAt = 0
  }

  start() {
    if (this.child || this.stopping || this.restartSuppressed) return this.child
    const headless = this.options.headless ?? process.env.DSH_DAFEIYU_HEADLESS === '1'
    const helperPath = this.options.helperPath || defaultHelperPath
    const launch = this.options.command
      ? { command: this.options.command, args: defaultArgs(this.options.command, helperPath) }
      : defaultLaunch(headless)
    const command = launch.command
    const args = this.options.args || launch.args
    if (process.platform !== 'win32' && isBundledHelperCommand(command)) {
      ensureExecutable(command)
    }
    const extraArgs = []
    const eventLog = this.options.eventLog || process.env.DSH_DAFEIYU_EVENT_LOG
    const snapshot = this.options.snapshot || process.env.DSH_DAFEIYU_SNAPSHOT
    if (headless) extraArgs.push('--headless')
    if (eventLog) extraArgs.push('--event-log', eventLog)
    if (snapshot) extraArgs.push('--snapshot', snapshot)

    const child = spawn(command, [...args, ...extraArgs], {
      cwd: this.options.cwd || resolve(here, '..'),
      env: { ...process.env, ...this.options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child = child
    child.once('spawn', () => {
      const startupTimeoutMs = this.options.startupTimeoutMs ?? 60000
      this.startupTimer = setTimeout(() => {
        if (this.child === child && !this.spawned) {
          this.logger.warn?.('dsh-dafeiyu helper readiness timed out')
          child.kill()
        }
      }, startupTimeoutMs)
      this.startupTimer.unref?.()
    })
    child.once('error', (error) => {
      this.logger.error?.(`dsh-dafeiyu helper failed to start: ${error.message}`)
    })
    child.once('exit', (code, signal) => {
      if (this.child !== child) return
      this.child = undefined
      this.spawned = false
      this.#clearHeartbeat()
      this.#clearStartupTimer()
      if (!this.stopping && !this.restartSuppressed) {
        this.logger.warn?.(`dsh-dafeiyu helper exited (code=${String(code)}, signal=${String(signal)}); restarting`)
        this.#scheduleRestart()
      }
    })
    createInterface({ input: child.stdout }).on('line', (line) => this.#handleReply(line))
    createInterface({ input: child.stderr }).on('line', (line) => {
      if (line.trim()) this.logger.warn?.(`dsh-dafeiyu helper: ${line}`)
    })
    return child
  }

  send(message) {
    this.#remember(message)
    const line = encodeMessage(message)
    if (!this.child || !this.spawned || !this.child.stdin.writable || this.child.stdin.destroyed) {
      if (!this.hasEverSpawned
        || ![CompanionMessageKind.HELLO, CompanionMessageKind.STATE, CompanionMessageKind.TASK, CompanionMessageKind.TASKS, CompanionMessageKind.PULSE, CompanionMessageKind.CONFIG].includes(message.kind)) {
        this.queue.push(line)
      }
      return
    }
    this.child.stdin.write(line)
  }

  stop(reason = 'plugin-disposed') {
    this.stopping = true
    this.#clearHeartbeat()
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = undefined
    const child = this.child
    if (!child) return
    this.queue.push(encodeMessage(createMessage(CompanionMessageKind.SHUTDOWN, { reason })))
    if (this.spawned) {
      this.#flushQueue()
      this.#endInput(child)
    }
    const timer = setTimeout(() => {
      if (this.child === child) child.kill()
    }, this.options.shutdownTimeoutMs ?? 10000)
    timer.unref?.()
  }

  #remember(message) {
    if (message.kind === CompanionMessageKind.HELLO) this.snapshot.set('hello', encodeMessage(message))
    if (message.kind === CompanionMessageKind.STATE) this.snapshot.set('state', encodeMessage(message))
    if (message.kind === CompanionMessageKind.TASK) this.snapshot.set('task', encodeMessage(message))
    if (message.kind === CompanionMessageKind.TASKS) this.snapshot.set('tasks', encodeMessage(message))
    if (message.kind === CompanionMessageKind.CONFIG) this.snapshot.set('config', encodeMessage(message))
  }

  #flushSnapshot() {
    const child = this.child
    if (!this.spawned || !child?.stdin.writable || child.stdin.destroyed) return
    const payload = [...this.snapshot.values()].join('')
    if (payload) child.stdin.write(payload)
  }

  #flushQueue() {
    const child = this.child
    if (!this.spawned || !child?.stdin.writable || child.stdin.destroyed) return
    const payload = this.queue.splice(0).join('')
    if (payload) child.stdin.write(payload)
  }

  #handleReply(line) {
    if (!line.trim()) return
    try {
      const reply = JSON.parse(line)
      if (reply?.protocolVersion === 1 && reply.kind === CompanionMessageKind.READY) {
        if (this.spawned) return
        const firstSpawn = !this.hasEverSpawned
        this.hasEverSpawned = true
        this.spawned = true
        this.lastPongAt = Date.now()
        this.#clearStartupTimer()
        if (firstSpawn) this.#flushQueue()
        else {
          this.#flushSnapshot()
          this.#flushQueue()
        }
        this.#startHeartbeat()
        if (this.stopping) this.#endInput(this.child)
        return
      }
      if (reply?.protocolVersion === 1 && reply.kind === CompanionMessageKind.PONG) {
        this.lastPongAt = Date.now()
        return
      }
      if (reply?.protocolVersion === 1 && reply.kind === CompanionMessageKind.CLOSED) {
        this.restartSuppressed = true
        return
      }
    } catch {
      // Non-protocol stdout is still useful in development logs.
    }
    this.logger.debug?.(`dsh-dafeiyu helper: ${line}`)
  }

  #startHeartbeat() {
    const heartbeatMs = this.options.heartbeatMs ?? 5000
    if (heartbeatMs <= 0) return
    const timeoutMs = this.options.heartbeatTimeoutMs ?? Math.max(heartbeatMs * 3, 12000)
    this.heartbeatTimer = setInterval(() => {
      const child = this.child
      if (!child || !this.spawned) return
      if (Date.now() - this.lastPongAt > timeoutMs) {
        this.logger.warn?.('dsh-dafeiyu helper heartbeat timed out')
        child.kill()
        return
      }
      this.send(createMessage(CompanionMessageKind.PING))
    }, heartbeatMs)
    this.heartbeatTimer.unref?.()
  }

  #clearHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = undefined
  }

  #clearStartupTimer() {
    if (this.startupTimer) clearTimeout(this.startupTimer)
    this.startupTimer = undefined
  }

  #scheduleRestart() {
    if (this.restartTimer || this.stopping || this.restartSuppressed) return
    const delay = this.options.restartDelayMs ?? 750
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined
      this.start()
    }, delay)
    this.restartTimer.unref?.()
  }

  #endInput(child) {
    if (child.stdin.writable && !child.stdin.destroyed) child.stdin.end()
  }
}

export {
  bundledHelperPath,
  linuxBundledHelperPath,
  defaultHelperPath,
  defaultArgs,
  defaultCommand,
  defaultLaunch,
  isBundledHelperCommand,
  isWsl,
  resolveHelperLaunch,
  shouldUseBundledHelper,
  toWindowsPath,
}
