import { spawn } from 'node:child_process'
import { mkdir, rm, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..')
const argument = (name) => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}
const executable = resolve(argument('--executable')
  ?? resolve(
    projectRoot,
    process.platform === 'win32'
      ? 'runtime/bin/win32-x64/dsh-dafeiyu-helper.exe'
      : process.platform === 'darwin'
        ? 'runtime/bin/darwin/dsh-dafeiyu-helper.app/Contents/MacOS/dsh-dafeiyu-helper'
        : 'runtime/bin/linux-x64/dsh-dafeiyu-helper',
  ))
const snapshot = resolve(argument('--snapshot')
  ?? resolve(projectRoot, '.build/helper/packaged-visual-smoke.png'))
const timeoutMs = Number(argument('--timeout-ms') ?? 15_000)
const hasReply = (output, kind) => output.split(/\r?\n/).some((line) => {
  if (!line.trim()) return false
  try {
    return JSON.parse(line).kind === kind
  } catch {
    return false
  }
})

await stat(executable)
await mkdir(dirname(snapshot), { recursive: true })
await rm(snapshot, { force: true })

const child = spawn(executable, ['--snapshot', snapshot], {
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
})
let standardError = ''
let standardOutput = ''
child.stderr.setEncoding('utf8')
child.stdout.setEncoding('utf8')
child.stderr.on('data', (chunk) => { standardError += chunk })
child.stdout.on('data', (chunk) => { standardOutput += chunk })

const exit = new Promise((resolveExit) => {
  child.once('exit', (code, signal) => resolveExit({ code, signal }))
})
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
const waitUntil = async (predicate, label) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    if (child.exitCode !== null) {
      throw new Error(`${label}: helper exited early with code ${child.exitCode}. ${standardError}`)
    }
    await delay(50)
  }
  throw new Error(`${label}: timed out after ${timeoutMs} ms. stdout=${standardOutput} stderr=${standardError}`)
}

try {
  await waitUntil(() => hasReply(standardOutput, 'ready'), 'ready handshake')
  child.stdin.write(`${JSON.stringify({
    protocolVersion: 1,
    kind: 'state',
    timestamp: Date.now(),
    state: 'WORKING',
    activity: 'testing',
    message: 'Packaged visual smoke test',
    detail: 'Qt renderer and assets are available',
  })}\n`)
  child.stdin.write(`${JSON.stringify({
    protocolVersion: 1,
    kind: 'tasks',
    timestamp: Date.now(),
    tasks: [
      { sessionId: 'one', state: 'WORKING', project: 'dsh-dafeiyu', task: 'Packaged Helper validation' },
      { sessionId: 'two', state: 'WAITING', project: process.platform, task: 'User confirmation' },
    ],
  })}\n`)
  await waitUntil(async () => {
    try {
      return (await stat(snapshot)).size > 1024
    } catch {
      return false
    }
  }, 'visual snapshot')
  child.stdin.end(`${JSON.stringify({
    protocolVersion: 1,
    kind: 'shutdown',
    timestamp: Date.now(),
  })}\n`)
  const result = await Promise.race([
    exit,
    delay(5_000).then(() => ({ timeout: true })),
  ])
  if (result.timeout) {
    child.kill()
    throw new Error('helper did not exit after shutdown')
  }
  if (result.code !== 0) {
    throw new Error(`helper exited with code ${result.code}. ${standardError}`)
  }
  console.log(`Packaged helper visual smoke test passed: ${snapshot}`)
} catch (error) {
  if (child.exitCode === null) child.kill()
  throw error
}

const eofChild = spawn(executable, ['--headless'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
})
let eofOutput = ''
let eofError = ''
eofChild.stdout.setEncoding('utf8')
eofChild.stderr.setEncoding('utf8')
eofChild.stdout.on('data', (chunk) => { eofOutput += chunk })
eofChild.stderr.on('data', (chunk) => { eofError += chunk })
const eofExit = new Promise((resolveExit) => {
  eofChild.once('exit', (code, signal) => resolveExit({ code, signal }))
})
const eofDeadline = Date.now() + timeoutMs
while (!hasReply(eofOutput, 'ready') && Date.now() < eofDeadline) {
  if (eofChild.exitCode !== null) {
    throw new Error(`headless helper exited before ready with code ${eofChild.exitCode}. ${eofError}`)
  }
  await delay(50)
}
if (!hasReply(eofOutput, 'ready')) {
  eofChild.kill()
  throw new Error(`headless ready handshake timed out. stdout=${eofOutput} stderr=${eofError}`)
}
eofChild.stdin.end()
const eofResult = await Promise.race([
  eofExit,
  delay(5_000).then(() => ({ timeout: true })),
])
if (eofResult.timeout) {
  eofChild.kill()
  throw new Error('headless helper did not exit after stdin EOF')
}
if (eofResult.code !== 0) {
  throw new Error(`headless helper exited with code ${eofResult.code}. ${eofError}`)
}
console.log('Packaged helper stdin-EOF lifecycle test passed')
