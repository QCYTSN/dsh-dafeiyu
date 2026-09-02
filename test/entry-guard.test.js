import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

test('entry guard keeps the loader working when a runtime dependency is missing', () => {
  // The entry resolves './plugin.js' relative to its own location, so a temp
  // directory with a broken plugin.js reproduces the incomplete-install case
  // (issue #39) without uninstalling the real dependencies.
  const dir = mkdtempSync(join(tmpdir(), 'dsh-entry-guard-'))
  writeFileSync(join(dir, 'index.js'), readFileSync(new URL('../src/index.js', import.meta.url)))
  writeFileSync(
    join(dir, 'plugin.js'),
    "throw new Error(\"Cannot find package '@deepseek-ai/schemastery' imported from plugin.js\")\n",
  )
  const script = `const m = await import(${JSON.stringify(pathToFileURL(join(dir, 'index.js')).href)});`
    + 'console.log(JSON.stringify({ name: m.name, inject: m.inject, apply: typeof m.apply }))'
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' })
  assert.equal(run.status, 0, `entry import failed: ${run.stderr}`)
  assert.match(run.stderr, /Cannot find package '@deepseek-ai\/schemastery'/)
  assert.match(run.stderr, /\[dsh-dafeiyu\].*自动停用/)
  assert.match(run.stderr, /dsh plugin --profile web add/)
  const exported = JSON.parse(run.stdout)
  assert.equal(exported.name, 'dsh-dafeiyu')
  assert.deepEqual(exported.inject, [])
  assert.equal(exported.apply, 'function')
})
