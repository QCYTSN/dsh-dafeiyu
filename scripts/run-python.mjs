import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const venvPython = process.platform === 'win32'
  ? resolve(root, 'venv', 'Scripts', 'python.exe')
  : resolve(root, 'venv', 'bin', 'python')
const python = process.env.DSH_DAFEIYU_PYTHON
  || (existsSync(venvPython) ? venvPython : undefined)
  || (process.platform === 'win32' ? 'py' : 'python3')
const extra = process.platform === 'win32' && /(^|[\\/])py(?:\.exe)?$/i.test(python)
  ? ['-3']
  : []

const child = spawn(python, [...extra, ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
})
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0))
})
child.on('error', (error) => {
  console.error(error.message)
  process.exit(1)
})
