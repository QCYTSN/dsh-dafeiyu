import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const windows = process.platform === 'win32'
const command = windows ? 'powershell' : 'bash'
const args = windows
  ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve(root, 'scripts/build-helper.ps1')]
  : [resolve(root, 'scripts/build-helper.sh')]

const child = spawn(command, args, { cwd: root, stdio: 'inherit' })
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0))
})
child.on('error', (error) => {
  console.error(error.message)
  process.exit(1)
})
