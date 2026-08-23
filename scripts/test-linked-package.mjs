import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

const input = process.argv[2]
if (!input) throw new Error('usage: node scripts/test-linked-package.mjs <extracted-package-directory>')

const packageDirectory = isAbsolute(input) ? input : resolve(process.cwd(), input)
const directory = await mkdtemp(join(tmpdir(), 'dsh-dafeiyu-linked-package-'))
const nodeModules = join(directory, 'node_modules')
const link = join(nodeModules, 'dsh-dafeiyu')
const entry = join(directory, 'verify.mjs')

try {
  await mkdir(nodeModules, { recursive: true })
  await symlink(packageDirectory, link, process.platform === 'win32' ? 'junction' : 'dir')
  await writeFile(entry, [
    "import { Config } from 'dsh-dafeiyu'",
    "if (!Config || !['function', 'object'].includes(typeof Config)) throw new Error('plugin Config did not load')",
    "process.stdout.write('linked package import passed\\n')",
  ].join('\n'))
  execFileSync(process.execPath, [entry], { cwd: directory, stdio: 'inherit' })
} finally {
  await rm(directory, { recursive: true, force: true })
}
