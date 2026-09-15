import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const assetRoot = join(repositoryRoot, 'assets', 'pet')
const manifestPath = join(repositoryRoot, 'assets', 'pet-manifest.json')

async function webpFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await webpFiles(path))
    else if (entry.isFile() && entry.name.endsWith('.webp')) files.push(path)
  }
  return files
}

// libwebp with alpha emits the extended VP8X chunk: canvas size is stored as
// 24-bit little-endian (value - 1) at RIFF payload offsets 24 and 27.
function webpSize(bytes) {
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', 'not a RIFF container')
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', 'not a WebP file')
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'VP8X', 'expected the extended VP8X chunk')
  return {
    width: bytes.readUIntLE(24, 3) + 1,
    height: bytes.readUIntLE(27, 3) + 1,
  }
}

test('pet manifest allowlists every bundled runtime frame', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.equal(manifest.formatVersion, 1)
  assert.ok(Object.keys(manifest.clips).length >= 15)

  const declared = new Set()
  for (const [clipName, clip] of Object.entries(manifest.clips)) {
    assert.ok(Array.isArray(clip.frames) && clip.frames.length > 0, `${clipName} has no frames`)
    assert.ok(Number.isInteger(clip.frameMs) && clip.frameMs > 0, `${clipName} has invalid frameMs`)
    for (const frame of clip.frames) {
      assert.equal(typeof frame, 'string')
      const path = resolve(assetRoot, frame)
      assert.ok(path.startsWith(`${assetRoot}${sep}`), `${clipName} escapes the asset root`)
      assert.equal(declared.has(frame), false, `duplicate frame declaration: ${frame}`)
      declared.add(frame)
      const bytes = await readFile(path)
      const { width, height } = webpSize(bytes)
      assert.ok(width > 0 && width <= manifest.maxFrameWidth, `${frame} width exceeds the runtime envelope`)
      assert.ok(height > 0 && height <= manifest.maxFrameHeight, `${frame} height exceeds the runtime envelope`)
    }
  }

  const bundled = new Set((await webpFiles(assetRoot)).map((path) => relative(assetRoot, path).split(sep).join('/')))
  assert.deepEqual([...bundled].sort(), [...declared].sort())
  for (const clip of Object.values(manifest.stateMap)) assert.ok(manifest.clips[clip])
  for (const clip of Object.values(manifest.workingActivityMap)) assert.ok(manifest.clips[clip])
  for (const clip of manifest.idleMicroClips) assert.ok(manifest.clips[clip])
})

test('state clips play full-motion loops at the source-native 24fps cadence', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  for (const clipName of ['idle', 'waiting', 'thinking', 'working', 'working_search', 'working_command', 'success', 'error', 'dragging']) {
    const clip = manifest.clips[clipName]
    assert.ok(clip.frames.length >= 30, `${clipName} should import a full-motion sequence`)
    assert.equal(clip.frameMs, 42, `${clipName} should stay on the source-native 24fps cadence`)
    assert.equal(clip.loop, true, `${clipName} state clips must loop`)
    assert.equal(clip.motion, undefined, `${clipName} uses real frames, not procedural motion`)
  }
})

test('touch overlays play once and hand control back to the base state', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  for (const clipName of ['dragging_release', 'dragging_protest', 'head_pat', 'poke', 'tail', 'eat_token']) {
    const clip = manifest.clips[clipName]
    assert.ok(clip, `${clipName} must stay registered for the helper overlays`)
    assert.equal(clip.loop, false, `${clipName} overlays must not loop`)
  }
})

test('drag daze stays procedural so reduced-motion devices keep a stable pose', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.equal(manifest.clips.dragging_dizzy.frames.length, 1)
  assert.equal(manifest.clips.dragging_dizzy.motion, 'dizzy')
  assert.equal(manifest.clips.dragging.motion, undefined)
})

test('original notification sounds are valid short mono WAV files', async () => {
  for (const name of ['success.wav', 'error.wav']) {
    const bytes = await readFile(join(repositoryRoot, 'assets', 'sounds', name))
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF')
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WAVE')
    assert.equal(bytes.readUInt16LE(22), 1, `${name} must stay mono`)
    assert.equal(bytes.readUInt32LE(24), 44100, `${name} sample rate drifted`)
    assert.ok(bytes.length > 20_000 && bytes.length < 50_000, `${name} should remain a short lightweight alert`)
  }
})
