import assert from 'node:assert/strict'
import test from 'node:test'
import { createBalanceQuery, createBalanceMonitor, createBalanceHandler, parseApiBalance } from '../src/balance.js'

const wire = { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '12.3456', granted_balance: '2.0000', topped_up_balance: '10.3456' }] }
const result = { ...parseApiBalance(wire), source: 'api-key' }
const tick = () => new Promise((resolve) => setImmediate(resolve))

test('balance query uses the configured credential and gateway without returning secrets', async () => {
  const resolved = []
  const ctx = {
    settings: { describe: () => [{ ns: 'llm-deepseek-api-key', value: { apiKeyEnv: 'MY_DEEPSEEK_KEY', baseURL: 'https://gateway.example/v1' } }] },
    get: () => ({ resolve: async (ref) => { resolved.push(ref); return { value: 'secret-for-test' } } }),
  }
  const query = createBalanceQuery(ctx, { fetchImpl: async (url, options) => {
    assert.equal(String(url), 'https://gateway.example/user/balance')
    assert.equal(options.headers.Authorization, 'Bearer secret-for-test')
    assert.equal(options.redirect, 'error')
    return new Response(JSON.stringify(wire))
  } })
  assert.deepEqual(await query('api-key'), result)
  assert.deepEqual(resolved, ['MY_DEEPSEEK_KEY'])
  assert.ok(!JSON.stringify(await query('api-key')).includes('secret-for-test'))
})

test('logged-in account balance keeps recharge and bonus currencies separate and sums decimals exactly', async () => {
  const account = {
    getState: async () => ({ status: 'credential-stored' }),
    getBalance: async () => ({ status: 'ready', value: [{ currency: 'CNY', balance: '1e-1' }, { currency: 'USD', balance: '1.0000' }], bonusWallets: [{ currency: 'CNY', balance: '.2' }] }),
  }
  const query = createBalanceQuery({ get: (name) => name === 'deepseekAccount' ? account : undefined }, { environment: {} })
  const value = await query('account')
  assert.equal(value.source, 'account')
  assert.deepEqual(value.balances, [
    { currency: 'CNY', toppedUp: '0.1', granted: '0.2', total: '0.3' },
    { currency: 'USD', toppedUp: '1.0000', granted: '0', total: '1.0000' },
  ])
})

test('balance decimals preserve account precision and reject unbounded exponent expansion', () => {
  const parse = (total) => parseApiBalance({ ...wire, balance_infos: [{ ...wire.balance_infos[0], total_balance: total }] }).balances[0].total
  assert.equal(parse('4.1421234567890123456E+1'), '41.421234567890123456')
  assert.equal(parse('-1e-18'), '-0.000000000000000001')
  assert.equal(parse('0.'), '0')
  for (const value of ['.', 'e2', 'Infinity', '1e99999999', '1e-99999999', '1'.repeat(129), ' 1']) {
    assert.throws(() => parse(value), { code: 'INVALID_RESPONSE' })
  }
})

test('missing credentials and invalid API responses never become a fake zero balance', async () => {
  const query = createBalanceQuery({}, { environment: {} })
  await assert.rejects(query('auto'), { code: 'NOT_CONFIGURED' })
  for (const value of [null, { is_available: true, balance_infos: [] }, { ...wire, balance_infos: [{ ...wire.balance_infos[0], total_balance: 'NaN' }] }]) {
    assert.throws(() => parseApiBalance(value), { code: 'INVALID_RESPONSE' })
  }
  assert.throws(() => parseApiBalance({ ...wire, balance_infos: [...wire.balance_infos, ...wire.balance_infos] }), { code: 'INVALID_RESPONSE' })
  assert.equal(parseApiBalance({ ...wire, is_available: false, balance_infos: [{ ...wire.balance_infos[0], total_balance: '0' }] }).available, false)
})

test('DSH provider directory and launch environment determine the gateway and credential', async () => {
  const services = {
    llm: { listConfigurableProviders: () => [{ provider: 'deepseek-official', settingsNs: 'custom-provider' }] },
    launchEnvironment: { get: (name) => ({ value: { CUSTOM_KEY: 'launch-secret', DEEPSEEK_BASE_URL: 'https://gateway.example/anthropic' }[name] }) },
  }
  const query = createBalanceQuery({
    get: (name) => services[name],
    settings: { describe: () => [{ ns: 'custom-provider', value: { apiKeyEnv: 'CUSTOM_KEY' } }] },
  }, { environment: { CUSTOM_KEY: 'obsolete-secret' }, fetchImpl: async (url, options) => {
    assert.equal(String(url), 'https://gateway.example/user/balance')
    assert.equal(options.headers.Authorization, 'Bearer launch-secret')
    return new Response(JSON.stringify(wire))
  } })
  assert.deepEqual(await query(), result)
})

test('credential service removal cannot fall back to an obsolete environment key', async () => {
  const query = createBalanceQuery({ get: (name) => name === 'credentials' ? { resolve: async () => undefined } : undefined }, {
    environment: { DEEPSEEK_API_KEY: 'obsolete-secret' }, fetchImpl: () => { throw new Error('must not query') },
  })
  await assert.rejects(query('api-key'), { code: 'NOT_CONFIGURED' })
})

test('oversized balance response streams are cancelled before reading unbounded data', async () => {
  let cancelled = false
  const query = createBalanceQuery({}, { environment: { DEEPSEEK_API_KEY: 'test' }, fetchImpl: async () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(33000)) },
    cancel() { cancelled = true },
  })) })
  await assert.rejects(query('api-key'), { code: 'INVALID_RESPONSE' })
  assert.equal(cancelled, true)
})

test('hung balance requests time out and a changed source rejects an old result', async (t) => {
  const keepAlive = setTimeout(() => {}, 200)
  t.after(() => clearTimeout(keepAlive))
  const timeout = createBalanceMonitor({ query: () => new Promise(() => {}), timeoutMs: 20 })
  t.after(() => timeout.stop())
  timeout.configure(true)
  await tick()
  await timeout.refresh()
  assert.equal(timeout.get().status, 'error')
  assert.deepEqual(timeout.get().balances, [])
  let finish
  const switched = createBalanceMonitor({ query: (source) => source === 'account'
    ? Promise.resolve({ ...result, source }) : new Promise((resolve) => { finish = resolve }) })
  t.after(() => switched.stop())
  switched.configure(true, 'api-key')
  await tick()
  switched.configure(true, 'account')
  finish(result)
  await tick()
  assert.equal(switched.get().source, 'account')
  assert.ok(!switched.get().summary.includes('API'))
})

test('shared cache joins concurrent refreshes and bounds manual refresh frequency', async (t) => {
  let now = 10000
  let calls = 0
  let finish
  const monitor = createBalanceMonitor({ now: () => now, query: () => { calls += 1; return new Promise((resolve) => { finish = resolve }) } })
  t.after(() => monitor.stop())
  monitor.configure(true)
  await tick()
  const first = monitor.refresh()
  const second = monitor.refresh(true)
  finish(result)
  await Promise.all([first, second])
  assert.equal(calls, 1)
  assert.equal(monitor.get().checkedAt, 10000)
  now += 4000
  await monitor.refresh(true)
  assert.equal(calls, 1)
  now += 2000
  const third = monitor.refresh(true)
  await tick()
  finish(result)
  await third
  assert.equal(calls, 2)
})

test('a failed refresh retains a clearly marked successful result and redacts errors', async (t) => {
  let now = 10000
  let fail = false
  const monitor = createBalanceMonitor({ now: () => now, query: async () => {
    if (fail) throw new Error('upstream echoed secret-for-test')
    return result
  } })
  t.after(() => monitor.stop())
  monitor.configure(true)
  await tick()
  fail = true
  now += 60000
  await monitor.refresh()
  assert.equal(monitor.get().status, 'error')
  assert.equal(monitor.get().checkedAt, 10000)
  assert.match(monitor.get().summary, /上次查询/)
  assert.ok(!JSON.stringify(monitor.get()).includes('secret-for-test'))
})

test('disabling during a query clears the balance and prevents late results from reappearing', async (t) => {
  let finish
  const monitor = createBalanceMonitor({ query: () => new Promise((resolve) => { finish = resolve }) })
  t.after(() => monitor.stop())
  monitor.configure(true)
  await tick()
  monitor.configure(false)
  finish(result)
  await tick()
  assert.equal(monitor.get().status, 'disabled')
  assert.equal(monitor.get().summary, '')
  assert.deepEqual(monitor.get().balances, [])
})

test('a Host change emitted while resolving a query immediately schedules the new source', async (t) => {
  const calls = []
  const monitor = createBalanceMonitor({ query: async (source) => {
    calls.push(source)
    if (source === 'api-key') monitor.configure(true, 'account')
    return { ...result, source }
  } })
  t.after(() => monitor.stop())
  monitor.configure(true, 'api-key')
  await tick()
  assert.deepEqual(calls, ['api-key', 'account'])
  assert.equal(monitor.get().status, 'ready')
  assert.equal(monitor.get().source, 'account')
})

test('balance endpoint refuses remote and cross-origin calls before querying', async () => {
  let calls = 0
  const handler = createBalanceHandler({ refresh: async () => { calls += 1; return result } })
  for (const [method, address, origin, expected] of [
    ['GET', '10.0.0.1', undefined, 403], ['POST', '127.0.0.1', 'https://evil.example', 403],
    ['DELETE', '127.0.0.1', undefined, 405], ['GET', '127.0.0.1', 'file://127.0.0.1:3080', 403],
    ['POST', '::ffff:127.0.0.1', 'http://127.0.0.1:3080', 200],
  ]) {
    let status
    await handler({ method, socket: { remoteAddress: address }, headers: { host: '127.0.0.1:3080', origin } },
      { writeHead: (code) => { status = code }, end() {} })
    assert.equal(status, expected)
  }
  assert.equal(calls, 1)
  let reboundStatus
  await handler({ method: 'GET', socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'evil.example:3080' } },
    { writeHead: (code) => { reboundStatus = code }, end() {} })
  assert.equal(reboundStatus, 403)
  assert.equal(calls, 1)
})
