import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const projectPython = process.platform === 'win32'
  ? resolve(root, '.build', 'python-env', 'Scripts', 'python.exe')
  : resolve(root, '.build', 'python-env', 'bin', 'python')
const python = process.env.DSH_DAFEIYU_PYTHON
  || (existsSync(projectPython) ? projectPython : undefined)
  || (process.platform === 'win32' ? 'py' : 'python3')
const launcherArgs = process.platform === 'win32' && /(^|[\\/])py(?:\.exe)?$/i.test(python)
  ? ['-3']
  : []

const child = spawn(python, [...launcherArgs, ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
})
child.once('error', (error) => {
  console.error(`Unable to launch Python (${python}): ${error.message}`)
  process.exitCode = 1
})
child.once('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0)
})
