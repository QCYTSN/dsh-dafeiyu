// Run against an isolated published DSH installation, without user profiles,
// native UI, or credentials. The real Loader and SettingsForms own validation
// and live references; a small file adapter stands in for ConfigEditor storage.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Config } from '../src/plugin.js'
import { createSettingsScope, plainConfig } from '../src/settings-scope.js'

if (!process.argv[2]) throw new Error('Usage: node scripts/test-dsh-settings.mjs <DSH installation directory>')
const runtime = resolve(process.argv[2], 'node_modules', '@deepseek-ai')
const load = (name) => import(pathToFileURL(join(runtime, name, 'lib', 'index.js')))
const { Context } = await load('cordis')
const { Loader } = await load('cordis-plugin-loader')
const { default: SettingsForms } = await load('dsh-settings')
const directory = await mkdtemp(join(tmpdir(), 'bigfish-dsh-settings-'))
const path = join(directory, 'patch.json')
const ctx = new Context()
const loaderFiber = ctx.plugin(Loader)
await loaderFiber.await()
const loader = ctx.loader
let scope
let mounts = 0
loader.builtins.bigfish = { Config, inject: ['settings'], apply(owner, config) {
  mounts += 1
  scope = createSettingsScope(owner, Config, config, plainConfig)
  owner.on('dispose', () => scope.dispose())
} }
ctx.provide('profileContext', { home: directory, name: 'isolated-test' })
ctx.provide('configEditor', {
  documentPath: path,
  entries: () => [...loader.entries()],
  configuration: () => [...loader.entries()].map((entry) => ({ entry, inherited: {}, override: entry.options.config ?? {} })),
  async edit(entry, change) {
    const next = change(entry.options.config ?? {}, {})
    await writeFile(path, JSON.stringify(next))
    await loader.update(entry.id, { config: next })
  },
})
const settingsFiber = ctx.plugin(SettingsForms)
await settingsFiber.await()
try {
  await loader.create({ id: 'custom-bigfish', name: 'cordis:bigfish', config: { scale: 0.8 } })
  await loader.await()
  assert.equal(scope.get().scale, 0.8)
  assert.equal(ctx.settings.describe().find((row) => row.ns === 'custom-bigfish').value.scale, 0.8)
  const seen = []
  scope.watch((next) => seen.push(next.scale))
  await scope.update({ scale: 0.6, clientTarget: 'desktop', balanceSource: 'account' })
  assert.equal(scope.get().scale, 0.6)
  assert.equal(mounts, 1, 'live edit must not restart the plugin')
  assert.equal(JSON.parse(await readFile(path, 'utf8')).balanceSource, 'account')
  assert.ok(seen.includes(0.6))
  await loader.resolve('custom-bigfish').fiber.dispose()
  await loader.resolve('custom-bigfish').refresh()
  await loader.await()
  assert.equal(scope.get().scale, 0.6)
  console.log('DSH settings integration passed: namespace, live edit, stored patch, remount')
} finally {
  await loader.resolve('custom-bigfish').fiber?.dispose()
  await settingsFiber.dispose()
  await loaderFiber.dispose()
  await rm(directory, { recursive: true, force: true })
}
