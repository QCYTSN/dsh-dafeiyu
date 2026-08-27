import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

function createReactMock() {
  const effects = []
  const refs = []
  const stateStore = []
  let stateIndex = 0

  const React = {
    createElement() {},
    useEffect(callback) { effects.push(callback) },
    useRef(initial) { const ref = { current: initial }; refs.push(ref); return ref },
    useState(initial) {
      const idx = stateIndex++
      stateStore[idx] = initial
      const setter = (value) => { stateStore[idx] = typeof value === 'function' ? value(stateStore[idx]) : value }
      return [stateStore[idx], setter]
    },
    Fragment: 'Fragment',
  }

  return { React, effects, refs, stateStore }
}

async function loadBigFishCard(React, fetchImpl) {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let bigFishCard
  let client
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load({ factory }) {
          client = factory((id) => {
            if (id === 'react') return React
            throw new Error(`unexpected require: ${id}`)
          })
          client.apply({
            slots: {
              inject(name, register) { register() },
              register(options, component) { bigFishCard = component; return {} },
            },
          })
        },
      },
    },
    console,
    fetch: fetchImpl,
    setTimeout,
    clearTimeout,
  }
  runInNewContext(source, sandbox)
  return bigFishCard
}

test('settings card: uses CSS variables instead of private hashes', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.ok(!source.includes('YyYd_a_'), 'should not contain YyYd_a_ hash')
  assert.ok(!source.includes('At1oFq_'), 'should not contain At1oFq_ hash')
  assert.ok(source.includes('--dsw-alias-border-l2'), 'should use --dsw-alias-border-l2')
  assert.ok(source.includes('--dsw-alias-bg-layer-2'), 'should use --dsw-alias-bg-layer-2')
})

test('settings card: finite retry stops after max retries', async () => {
  const { React, effects } = createReactMock()
  let fetchCallCount = 0
  const fetchImpl = () => { fetchCallCount++; return Promise.reject(new Error('network error')) }

  const BigFishCard = await loadBigFishCard(React, fetchImpl)
  assert.ok(BigFishCard, 'expected BigFishCard component')

  BigFishCard()

  const mountEffect = effects[0]
  assert.ok(mountEffect, 'expected mount effect')
  const cleanup = mountEffect()

  // Wait for initial fetch + 3 retries (1s + 2s + 4s = 7s)
  await new Promise((resolve) => setTimeout(resolve, 7500))

  // Should have exactly 3 fetch calls: 1 initial + 2 retries (stops at maxRetries=3)
  assert.equal(fetchCallCount, 3, `expected 3 fetch calls, got ${fetchCallCount}`)

  cleanup()
})

test('settings card: cleanup clears retry timer on unmount', async () => {
  const { React, effects } = createReactMock()
  let fetchCallCount = 0
  const fetchImpl = () => { fetchCallCount++; return Promise.reject(new Error('network error')) }

  const BigFishCard = await loadBigFishCard(React, fetchImpl)
  assert.ok(BigFishCard, 'expected BigFishCard component')

  BigFishCard()

  const mountEffect = effects[0]
  assert.ok(mountEffect, 'expected mount effect')
  const cleanup = mountEffect()

  // Wait a bit then unmount
  await new Promise((resolve) => setTimeout(resolve, 1500))
  const callsBeforeUnmount = fetchCallCount

  // Unmount
  cleanup()

  // Wait to ensure no more retries
  await new Promise((resolve) => setTimeout(resolve, 6000))
  assert.equal(fetchCallCount, callsBeforeUnmount, 'no more fetches after unmount')
})

test('settings card: successful fetch stops retry loop', async () => {
  const { React, effects } = createReactMock()
  let fetchCallCount = 0
  const fetchImpl = () => { fetchCallCount++; return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) }

  const BigFishCard = await loadBigFishCard(React, fetchImpl)
  assert.ok(BigFishCard, 'expected BigFishCard component')

  BigFishCard()

  const mountEffect = effects[0]
  assert.ok(mountEffect, 'expected mount effect')
  const cleanup = mountEffect()

  // Wait for fetch to complete
  await new Promise((resolve) => setTimeout(resolve, 500))

  // Should have exactly 1 fetch call (success, no retries needed)
  assert.equal(fetchCallCount, 1, 'expected 1 fetch call on success')

  // Wait more to ensure no retries
  await new Promise((resolve) => setTimeout(resolve, 3000))
  assert.equal(fetchCallCount, 1, 'no retries after success')

  cleanup()
})

test('settings card: single-layer debounce in SliderField', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  // Should have exactly one setTimeout with 250ms delay (single layer debounce)
  const debounceMatches = source.match(/setTimeout\(\(\)\s*=>\s*\{[^}]*onChange[^}]*\},\s*250/g)
  assert.ok(debounceMatches, 'should have a 250ms debounce')
  assert.equal(debounceMatches.length, 1, 'should have exactly one 250ms debounce (single layer)')
  // Parent writeSlider should NOT have a second debounce
  const writeSliderMatch = source.match(/writeSlider[\s\S]*?setTimeout[^}]*\},\s*(\d+)\)/)
  assert.ok(!writeSliderMatch || writeSliderMatch[1] !== '250', 'writeSlider should not have a 250ms debounce')
})

test('settings card: syncs external value to local slider state', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  // Should have useEffect that syncs value prop to localValue
  assert.match(source, /useEffect\(\(\)\s*=>\s*\{?\s*setLocalValue\(value\)/u,
    'should sync external value to local state via useEffect')
})

test('settings card: starts collapsed and body renders only when open', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  // Card starts collapsed: useState(false) for open state
  assert.match(source, /useState\(false\)/, 'card should start collapsed (useState(false))')
  // Body only renders when open is true (conditional rendering)
  assert.match(source, /open\s*&&/, 'body content should only render when open is true')
  // Clicking header toggles open state
  assert.match(source, /onClick:\s*\(\)\s*=>\s*setOpen\(!open\)/, 'clicking header should toggle open state')
})
