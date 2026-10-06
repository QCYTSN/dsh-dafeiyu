import { isLocalRequest, jsonResponse } from './local-http.js'

export const BALANCE_ENDPOINT = '/plugins/dsh-dafeiyu/balance'
const errors = {
  NOT_CONFIGURED: '请在 DSH 中配置 DeepSeek API Key，或登录 DeepSeek 账户。',
  AUTH: '余额凭据无效或已过期，请检查 DSH 的模型／账户设置。',
  UNAVAILABLE: '余额服务暂时不可用，稍后可重新刷新。',
  INVALID_RESPONSE: '余额服务返回了无法识别的数据。',
}

function balanceError(code) {
  return Object.assign(new Error(errors[code]), { code })
}

function amount(value) {
  if (typeof value !== 'string' || !/^-?\d{1,16}(?:\.\d{1,12})?$/.test(value)) {
    throw balanceError('INVALID_RESPONSE')
  }
  return value
}

function sumAmounts(left, right) {
  const decimals = Math.max(left.split('.')[1]?.length ?? 0, right.split('.')[1]?.length ?? 0)
  const integer = (value) => {
    const negative = value.startsWith('-')
    const [whole, fraction = ''] = value.replace(/^-/, '').split('.')
    return BigInt(whole + fraction.padEnd(decimals, '0')) * (negative ? -1n : 1n)
  }
  const sum = integer(left) + integer(right)
  const digits = (sum < 0n ? -sum : sum).toString().padStart(decimals + 1, '0')
  return (sum < 0n ? '-' : '') + (decimals ? digits.slice(0, -decimals) + '.' + digits.slice(-decimals) : digits)
}

export function parseApiBalance(body) {
  if (typeof body?.is_available !== 'boolean' || !Array.isArray(body.balance_infos)
    || body.balance_infos.length === 0 || body.balance_infos.length > 8) throw balanceError('INVALID_RESPONSE')
  const currencies = new Set()
  return {
    available: body.is_available,
    balances: body.balance_infos.map((row) => {
      if (!['CNY', 'USD'].includes(row?.currency) || currencies.has(row.currency)) throw balanceError('INVALID_RESPONSE')
      currencies.add(row.currency)
      return { currency: row.currency, total: amount(row.total_balance), granted: amount(row.granted_balance), toppedUp: amount(row.topped_up_balance) }
    }),
  }
}

function parseAccountBalance(body) {
  if (body?.status !== 'ready') throw balanceError('UNAVAILABLE')
  if (!Array.isArray(body.value) || !Array.isArray(body.bonusWallets)) throw balanceError('INVALID_RESPONSE')
  const currencies = new Map()
  for (const [field, wallets] of [['toppedUp', body.value], ['granted', body.bonusWallets]]) {
    for (const wallet of wallets) {
      if (!['CNY', 'USD'].includes(wallet?.currency)) throw balanceError('INVALID_RESPONSE')
      const row = currencies.get(wallet.currency) ?? { currency: wallet.currency, toppedUp: '0', granted: '0' }
      row[field] = sumAmounts(row[field], amount(wallet.balance))
      currencies.set(wallet.currency, row)
    }
  }
  if (!currencies.size) throw balanceError('INVALID_RESPONSE')
  const balances = [...currencies.values()].map((row) => ({ ...row, total: sumAmounts(row.granted, row.toppedUp) }))
  return { available: balances.some((row) => Number(row.total) > 0), balances }
}

function serviceOf(ctx, name) {
  try { return ctx.get?.(name) ?? ctx[name] } catch { return undefined }
}

async function responseText(response) {
  if (!response.body?.getReader) return response.text()
  const reader = response.body.getReader()
  const chunks = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 32768) {
        await reader.cancel().catch(() => {})
        throw balanceError('INVALID_RESPONSE')
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally { reader.releaseLock() }
}

export function balanceProviderNamespace(ctx) {
  return serviceOf(ctx, 'llm')?.listConfigurableProviders?.()
    .find((row) => row.provider === 'deepseek-official')?.settingsNs
}

export function createBalanceQuery(ctx, { fetchImpl = fetch, environment = process.env, version = 'unknown' } = {}) {
  return async (source = 'auto', signal) => {
    const forms = ctx.settings?.describe?.() ?? []
    const namespace = balanceProviderNamespace(ctx)
    const provider = forms.find((row) => namespace ? row.ns === namespace
      : ['llm-deepseek', 'llm-deepseek-api-key'].includes(row.ns))?.value ?? {}
    const launch = serviceOf(ctx, 'launchEnvironment')
    const envValue = (name) => launch ? launch.get(name)?.value : environment[name]
    const ref = provider.apiKeyEnv ?? 'DEEPSEEK_API_KEY'
    const credentials = serviceOf(ctx, 'credentials')
    const credential = source === 'account' ? undefined : credentials
      ? await credentials.resolve(ref)
      : { value: envValue(ref) }
    if (typeof credential?.value === 'string' && credential.value.trim()) {
      const url = new URL(provider.baseURL ?? envValue('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com')
      if (url.username || url.password || (url.protocol !== 'https:'
        && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
        throw balanceError('UNAVAILABLE')
      }
      url.pathname = url.pathname.replace(/\/(?:v1|anthropic)\/?$/, '').replace(/\/$/, '') + '/user/balance'
      url.search = ''
      url.hash = ''
      const response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${credential.value}` },
        signal, redirect: 'error',
      })
      if (!response.ok) throw balanceError([401, 403].includes(response.status) ? 'AUTH' : 'UNAVAILABLE')
      const text = await responseText(response)
      if (text.length > 32768) throw balanceError('INVALID_RESPONSE')
      let body
      try { body = JSON.parse(text) } catch { throw balanceError('INVALID_RESPONSE') }
      return { ...parseApiBalance(body), source: 'api-key' }
    }
    const account = serviceOf(ctx, 'deepseekAccount')
    if (source !== 'api-key' && typeof account?.getBalance === 'function') {
      const state = await account.getState()
      if (state?.status === 'credential-stored') {
        let hostVersion = version
        try {
          hostVersion = serviceOf(ctx, 'pluginPackages')?.packageOf?.('@deepseek-ai/dsh-app-boot', ctx.baseUrl ?? import.meta.url)?.version ?? version
        } catch {}
        const body = await account.getBalance({
          version: hostVersion, locale: 'zh-CN', timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
        })
        if (body === null) throw balanceError('NOT_CONFIGURED')
        return { ...parseAccountBalance(body), source: 'account' }
      }
    }
    throw balanceError('NOT_CONFIGURED')
  }
}

export function balanceSummary(snapshot) {
  if (snapshot.status === 'disabled') return ''
  if (snapshot.status === 'loading') return '正在查询余额…'
  if (!snapshot.balances.length) return snapshot.status === 'not-configured' ? '余额未配置' : '余额暂不可用'
  const amounts = snapshot.balances.map((row) => new Intl.NumberFormat('zh-CN', {
    style: 'currency', currency: row.currency, minimumFractionDigits: 2, maximumFractionDigits: 4,
  }).format(row.total)).join(' · ')
  return `${snapshot.source === 'account' ? '账户' : 'API'} 余额 ${amounts}${snapshot.status === 'error' ? '（上次查询）' : ''}`
}

export function createBalanceMonitor({ query, onChange = () => {}, now = Date.now, intervalMs = 60000, timeoutMs = 10000 }) {
  let snapshot = { status: 'disabled', balances: [], checkedAt: null, source: null, available: null, error: null, summary: '' }
  let source = 'auto'
  let enabled = false
  let stopped = false
  let generation = 0
  let lastAttempt = -Infinity
  let timer
  let pending
  let controller
  const publish = (next) => {
    snapshot = { ...next, summary: balanceSummary(next) }
    onChange(snapshot)
  }
  const refresh = async (force = false) => {
    if (stopped || !enabled) return snapshot
    if (pending) return pending
    if (now() - lastAttempt < (force ? 5000 : intervalMs)) return snapshot
    const started = generation
    lastAttempt = now()
    controller = new AbortController()
    const signal = controller.signal
    const requestedSource = source
    let timeout
    const expired = new Promise((_, reject) => {
      timeout = setTimeout(() => { controller?.abort(); reject(balanceError('UNAVAILABLE')) }, timeoutMs)
      timeout.unref?.()
    })
    // Publish the pending promise before query() can emit Host settings events.
    pending = Promise.resolve().then(async () => {
      try {
        if (started !== generation || stopped) return snapshot
        const result = await Promise.race([query(requestedSource, signal), expired])
        if (started === generation && !stopped) {
          publish({ ...result, checkedAt: now(), status: 'ready', error: null })
        }
      } catch (error) {
        if (started === generation && !stopped) {
          const code = Object.hasOwn(errors, error?.code) ? error.code : 'UNAVAILABLE'
          const retained = ['NOT_CONFIGURED', 'AUTH'].includes(code)
            ? { balances: [], checkedAt: null, available: null, source: null } : {}
          publish({ ...snapshot, ...retained, status: code === 'NOT_CONFIGURED' ? 'not-configured' : 'error', error: errors[code] })
        }
      } finally {
        clearTimeout(timeout)
        pending = undefined
      }
      return snapshot
    })
    return pending
  }
  const poll = () => {
    clearTimeout(timer)
    if (!enabled || stopped) return
    timer = setTimeout(() => { void refresh().finally(poll) }, intervalMs)
    timer.unref?.()
  }
  return {
    get: () => snapshot,
    refresh,
    configure(nextEnabled, nextSource = 'auto', invalidate = false) {
      if (stopped || (!invalidate && enabled === nextEnabled && source === nextSource)) return
      enabled = nextEnabled
      source = nextSource
      generation += 1
      controller?.abort()
      lastAttempt = -Infinity
      clearTimeout(timer)
      const next = { status: enabled ? 'loading' : 'disabled', source: null, balances: [], checkedAt: null, available: null, error: null }
      if (enabled || snapshot.status !== 'disabled') publish(next)
      // Wait for an old request to drain before querying a changed source.
      void Promise.resolve(pending).then(() => refresh()).finally(poll)
    },
    stop() {
      stopped = true
      generation += 1
      clearTimeout(timer)
      controller?.abort()
    },
  }
}

export function createBalanceHandler(monitor) {
  return async (req, res) => {
    if (!isLocalRequest(req)) return jsonResponse(res, 403, { error: 'local access only' })
    if (!['GET', 'POST'].includes(req.method)) return jsonResponse(res, 405, { error: 'method not allowed' })
    jsonResponse(res, 200, await monitor.refresh(req.method === 'POST'))
  }
}
