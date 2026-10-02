import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Schema from '@deepseek-ai/schemastery'
import { CompanionReducer } from './companion-reducer.js'
import { HelperProcess } from './helper-process.js'
import {
  CompanionMessageKind,
  CompanionState,
  createMessage,
} from './protocol.js'

const require = createRequire(import.meta.url)
const pkg = require('../package.json')

export const name = 'dsh-dafeiyu'
// The plugin's feature is built on session events, and mounting requires the
// settings service (used to read live config). Keep the declared inject in
// sync with those real hard dependencies instead of listing a service that
// is never consumed directly.
export const inject = ['sessions', 'settings']
export const CONFIG_ENDPOINT = '/plugins/dsh-dafeiyu/config'
export const EVENTS_ENDPOINT = '/plugins/dsh-dafeiyu/events'
export const MANIFEST_ENDPOINT = '/plugins/dsh-dafeiyu/manifest'
export const FRAME_ENDPOINT = '/plugins/dsh-dafeiyu/frame'

const here = dirname(fileURLToPath(import.meta.url))
const assetsRoot = resolve(here, '..', 'assets')
const configSchema = Schema.object({
  enabled: Schema.boolean().default(true).description('启用桌面大肥鱼'),
  scale: Schema.number().min(0.55).max(1.4).step(0.05).default(1).role('slider').description('角色大小'),
  bubbleScale: Schema.number().min(0.8).max(1.2).step(0.05).default(1).role('slider').description('气泡大小'),
  activityLevel: Schema.union([
    Schema.const('quiet').description('安静'),
    Schema.const('normal').description('标准'),
    Schema.const('lively').description('活泼'),
  ]).default('normal').description('空闲微动作频率'),
  reducedMotion: Schema.boolean().default(false).description('减少走动、循环帧和程序化晃动'),
  soundEnabled: Schema.boolean().default(true).description('任务完成或出错时播放提示音'),
  bubbleMode: Schema.union([
    Schema.const('hover').description('悬停时显示'),
    Schema.const('always').description('常驻显示'),
    Schema.const('hidden').description('完全隐藏'),
    Schema.const('custom').description('自定义显示状态'),
  ]).default('hover').description('气泡显示模式'),
  bubbleStates: Schema.array(Schema.string()).default(['SUCCESS', 'ERROR', 'WAITING']).description('自定义模式下显示气泡的状态'),
  includeSubagents: Schema.boolean().default(false).description('允许子 Agent 抢占宠物状态'),
  webOverlay: Schema.boolean().default(false).description('在 DSH 页面右下角显示轻量桌宠（可与桌面窗口同时开启）'),
  clickThrough: Schema.boolean().default(false).description('鼠标穿透：开启后点击大肥鱼会直接穿透到下面的窗口'),
  clickThroughHotkey: Schema.string().default('Ctrl+Alt+F').description('切换鼠标穿透的全局快捷键（例：Ctrl+Alt+F）'),
}).description('由 DeepSeek Harness 状态驱动的桌面大肥鱼伴侣')

// DSH only offers an entry in the settings directory when its schema yields a
// "volatile form": describe() skips every entry whose schema has no field
// marked volatile ("editable without remounting"). Without this flag the entry
// is absent from that directory, so the settings page has nothing to read or
// write and every save fails. Newer schemastery exposes .volatile(); the
// bundled 3.18.1 predates it and the host only inspects the plain
// `meta.volatile` property, so set that flag directly.
configSchema.meta.volatile = true

export const Config = configSchema

const defaults = Object.freeze({
  enabled: true,
  scale: 1,
  bubbleScale: 1,
  activityLevel: 'normal',
  reducedMotion: false,
  soundEnabled: true,
  bubbleMode: 'hover',
  bubbleStates: ['SUCCESS', 'ERROR', 'WAITING'],
  includeSubagents: false,
  webOverlay: false,
  clickThrough: false,
  clickThroughHotkey: 'Ctrl+Alt+F',
})

function publicConfig(config = {}) {
  return {
    enabled: config.enabled ?? defaults.enabled,
    scale: config.scale ?? defaults.scale,
    bubbleScale: config.bubbleScale ?? defaults.bubbleScale,
    activityLevel: config.activityLevel ?? defaults.activityLevel,
    reducedMotion: config.reducedMotion ?? defaults.reducedMotion,
    soundEnabled: config.soundEnabled ?? defaults.soundEnabled,
    bubbleMode: config.bubbleMode ?? defaults.bubbleMode,
    bubbleStates: Array.isArray(config.bubbleStates) ? config.bubbleStates : defaults.bubbleStates,
    includeSubagents: config.includeSubagents ?? defaults.includeSubagents,
    webOverlay: config.webOverlay === true,
    clickThrough: config.clickThrough === true,
    clickThroughHotkey: typeof config.clickThroughHotkey === 'string' && config.clickThroughHotkey.trim()
      ? config.clickThroughHotkey
      : defaults.clickThroughHotkey,
  }
}

function localSettingsScope(value) {
  return {
    get: () => value,
    watch: () => () => {},
  }
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

// Current DSH has no `settings.register()`: a plugin exports a Config schema,
// DSH projects it into a form, edits are written through `settings.update()`,
// and every edit is announced as `settings/document-updated`. This adapter
// keeps the small { get, watch, update } surface the rest of this file is
// written against, and returns undefined when the service is older or this
// entry is not in the settings directory - callers then fall back to the
// read-only snapshot, which is exactly how the plugin behaved before.
function createLiveSettingsScope(ctx, base, logger) {
  const service = ctx.settings
  if (!service || typeof service.describe !== 'function' || typeof service.update !== 'function') {
    return undefined
  }
  const watchers = new Set()
  let namespace
  let value = { ...base }

  // Keys no other plugin's config is likely to carry; used as a second way to
  // recognise our own entry when the namespace string is not self-describing.
  const fingerprint = ['bubbleMode', 'clickThroughHotkey', 'includeSubagents', 'webOverlay']
  const isOurs = (entry) => {
    if (typeof entry?.ns !== 'string') return false
    if (entry.ns.includes(pkg.name)) return true
    const candidate = entry.value
    return candidate !== null
      && typeof candidate === 'object'
      && fingerprint.every((key) => key in candidate)
  }

  // There is no "my own namespace" accessor and the branding is opaque, so the
  // entry is identified by package name (the namespace is documented as the
  // profile entry id) with a config fingerprint as a fallback. A wrong guess is
  // inert: the scope stays read-only and the warning below lists what was on
  // offer, so a mismatch costs one log line to diagnose rather than a mystery.
  const locate = () => {
    let entries
    try {
      entries = service.describe()
    } catch (error) {
      logger.warn?.(`dsh-dafeiyu could not read the settings directory: ${errorText(error)}`)
      return undefined
    }
    if (!Array.isArray(entries)) return undefined
    return entries.find(isOurs)
  }

  // Values this plugin has already applied to the running helper but that the
  // host has not confirmed yet. DSH does not reconcile the running composition
  // for a config write, so the live descriptor keeps reporting the old value
  // until the next start; without this the next describe() would push the stale
  // value back to the pet. An entry is dropped as soon as the live value agrees.
  const optimistic = new Map()

  const compose = (descriptor) => {
    const user = descriptor?.value && typeof descriptor.value === 'object' ? descriptor.value : {}
    const next = { ...base, ...user }
    for (const [key, expected] of optimistic) {
      if (JSON.stringify(next[key]) === JSON.stringify(expected)) optimistic.delete(key)
      else next[key] = expected
    }
    return next
  }

  const adopt = (descriptor) => {
    if (!descriptor) return false
    namespace = descriptor.ns
    const next = compose(descriptor)
    if (JSON.stringify(next) === JSON.stringify(value)) return false
    value = next
    return true
  }

  adopt(locate())
  if (namespace === undefined) {
    let available = []
    try {
      available = (service.describe() ?? []).map((entry) => entry?.ns).filter((ns) => typeof ns === 'string')
    } catch {
      // Reported by the warning below either way.
    }
    logger.warn?.(
      'dsh-dafeiyu is not in the DSH settings directory; its settings stay read-only until DSH restarts'
      + ` (available namespaces: ${available.join(', ') || 'none'})`,
    )
  }

  const notify = () => {
    for (const watcher of watchers) {
      try {
        watcher(value)
      } catch (error) {
        logger.error?.(`dsh-dafeiyu failed to apply settings: ${errorText(error)}`)
      }
    }
  }

  const off = ctx.on?.('settings/document-updated', (ns) => {
    // Another plugin's entry must not restart the pet.
    if (namespace !== undefined && ns !== namespace) return
    if (adopt(locate())) notify()
  })

  return {
    get: () => value,
    watch: (watcher) => {
      watchers.add(watcher)
      return () => watchers.delete(watcher)
    },
    update: async (patch) => {
      if (namespace === undefined && !adopt(locate())) {
        throw new Error('this plugin entry is not in the DSH settings directory')
      }
      await service.update(namespace, patch)
      // Persisting is not enough to make a change take effect here: DSH does not
      // reconcile the running composition for a config write, so the live value
      // stays stale until the next start and the caller would read the old one
      // straight back. Stand behind the value we just persisted and let the
      // watchers push it to the helper — the same shape as the pet's own context
      // menu, which applies a change in place and only then reports it to the
      // host. compose() keeps these values winning over the stale descriptor
      // until the host catches up.
      for (const [key, expected] of Object.entries(patch)) optimistic.set(key, expected)
      if (adopt(locate() ?? { ns: namespace })) notify()
    },
    dispose: () => {
      off?.()
      watchers.clear()
    },
  }
}

function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

async function readPatch(req) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > 8192) throw new Error('request body is too large')
    chunks.push(chunk)
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('patch must be an object')
  const allowed = new Set(Object.keys(defaults))
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error('patch contains an unknown setting')
  return value
}

export function createConfigHandler(settings) {
  return async (req, res) => {
    if (!isLoopback(req.socket?.remoteAddress)) {
      jsonResponse(res, 403, { error: 'local access only' })
      return
    }
    const origin = req.headers?.origin
    if (origin) {
      let originHost
      try { originHost = new URL(origin).host } catch {}
      if (!originHost || originHost !== req.headers.host) {
        jsonResponse(res, 403, { error: 'origin mismatch' })
        return
      }
    }
    if (req.method === 'GET') {
      jsonResponse(res, 200, settings.get())
      return
    }
    if (req.method !== 'PATCH') {
      jsonResponse(res, 405, { error: 'method not allowed' })
      return
    }
    if (typeof settings.update !== 'function') {
      // The read-only fallback is in use, so nothing the user changes here can
      // be stored. Say that instead of failing with a TypeError.
      jsonResponse(res, 503, {
        error: 'DSH settings are read-only for this plugin instance; restart DSH and try again',
      })
      return
    }
    try {
      await settings.update(await readPatch(req))
      jsonResponse(res, 200, settings.get())
    } catch (error) {
      jsonResponse(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

// Server-sent events channel mirroring the companion protocol for in-page
// consumers (the future web overlay). Snapshot kinds are remembered so a client
// that connects late still renders the current state immediately.
export function createEventStream() {
  const clients = new Set()
  const snapshot = new Map()
  return {
    get clientCount() {
      return clients.size
    },
    broadcast(message) {
      if (message?.kind === 'hello' || message?.kind === 'state' || message?.kind === 'task'
        || message?.kind === 'tasks' || message?.kind === 'config') {
        snapshot.set(message.kind, message)
      }
      const payload = `data: ${JSON.stringify(message)}\n\n`
      for (const res of clients) {
        try {
          res.write(payload)
        } catch {
          clients.delete(res)
        }
      }
    },
    add(res) {
      clients.add(res)
      for (const message of snapshot.values()) {
        res.write(`data: ${JSON.stringify(message)}\n\n`)
      }
      return () => clients.delete(res)
    },
  }
}

export function createEventsHandler(stream) {
  return (req, res) => {
    if (!isLoopback(req.socket?.remoteAddress)) {
      jsonResponse(res, 403, { error: 'local access only' })
      return
    }
    const origin = req.headers?.origin
    if (origin) {
      let originHost
      try { originHost = new URL(origin).host } catch {}
      if (!originHost || originHost !== req.headers.host) {
        jsonResponse(res, 403, { error: 'origin mismatch' })
        return
      }
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    })
    res.write('retry: 2000\n\n')
    const remove = stream.add(res)
    req.on('close', remove)
  }
}

// Frame bytes are served only for paths the manifest declares, so the query
// parameter can never steer the reader outside assets/pet. Returns null when
// the manifest cannot be read; the overlay routes then stay unregistered.
export function createAssetRoutes() {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(assetsRoot, 'pet-manifest.json'), 'utf8'))
  } catch {
    return null
  }
  const frames = new Set()
  for (const clip of Object.values(manifest.clips ?? {})) {
    for (const frame of clip.frames ?? []) frames.add(frame)
  }
  const allowed = (req) => {
    if (!isLoopback(req.socket?.remoteAddress)) return false
    const origin = req.headers?.origin
    if (!origin) return true
    let originHost
    try { originHost = new URL(origin).host } catch { return false }
    return originHost === req.headers.host
  }
  return {
    manifestHandler(req, res) {
      if (!allowed(req)) {
        jsonResponse(res, 403, { error: 'local access only' })
        return
      }
      jsonResponse(res, 200, manifest)
    },
    frameHandler(req, res) {
      if (!allowed(req)) {
        jsonResponse(res, 403, { error: 'local access only' })
        return
      }
      let frame
      try {
        frame = new URL(req.url ?? '', 'http://dsh.local').searchParams.get('frame')
      } catch {
        frame = null
      }
      if (!frame || !frames.has(frame)) {
        jsonResponse(res, 404, { error: 'unknown frame' })
        return
      }
      let bytes
      try {
        bytes = readFileSync(join(assetsRoot, 'pet', frame))
      } catch {
        jsonResponse(res, 404, { error: 'frame unavailable' })
        return
      }
      res.writeHead(200, {
        'content-type': 'image/webp',
        'cache-control': 'public, max-age=86400',
        'content-length': bytes.length,
      })
      res.end(bytes)
    },
  }
}

function mount(ctx, config = {}, eventCtx = ctx) {
  const logger = ctx.logger ?? console
  try {
    mountCompanion(ctx, config, eventCtx, logger)
  } catch (error) {
    // DSH treats a failing plugin activation as fatal for the whole boot
    // (dsh-app-boot rethrows init rejections). A host-side API change must
    // cost the pet its session, never the host its startup.
    logger.error?.(`dsh-dafeiyu failed to activate and stays disabled for this session: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function mountCompanion(ctx, config = {}, eventCtx = ctx, logger) {
  const base = publicConfig(config)
  const eventStream = createEventStream()
  const settings = createLiveSettingsScope(ctx, base, logger) ?? localSettingsScope(base)

  let bridge
  let reducer
  let restartTimer

  const stopRuntime = (reason = 'settings-change') => {
    bridge?.stop(reason)
    bridge = undefined
    reducer = undefined
  }

  const restartRuntime = (next) => {
    stopRuntime('settings-change')
    startRuntime(next)
  }

  const applyLiveSettings = (next) => {
    for (const message of reducer.setIncludeSubagents(next.includeSubagents === true)) bridge.send(message)
    bridge.send(createMessage(CompanionMessageKind.CONFIG, {
      scale: next.scale ?? defaults.scale,
      bubbleScale: next.bubbleScale ?? defaults.bubbleScale,
      activityLevel: next.activityLevel ?? defaults.activityLevel,
      reducedMotion: next.reducedMotion === true,
      soundEnabled: next.soundEnabled !== false,
      bubbleMode: next.bubbleMode ?? defaults.bubbleMode,
      bubbleStates: Array.isArray(next.bubbleStates) ? next.bubbleStates : defaults.bubbleStates,
      clickThrough: next.clickThrough === true,
      clickThroughHotkey: next.clickThroughHotkey ?? defaults.clickThroughHotkey,
    }))
  }

  const scheduleRestart = (next) => {
    if (restartTimer) clearTimeout(restartTimer)
    restartTimer = setTimeout(() => {
      restartTimer = undefined
      restartRuntime(next)
    }, 400)
    restartTimer.unref?.()
  }

  const startRuntime = (resolved) => {
    if (resolved.enabled === false) {
      logger.info?.('dsh-dafeiyu is disabled')
      return
    }
    const helperConfig = config.helper ?? {}
    bridge = new HelperProcess({
      ...helperConfig,
      env: {
        ...helperConfig.env,
        DSH_DAFEIYU_SCALE: String(resolved.scale ?? defaults.scale),
        DSH_DAFEIYU_BUBBLE_SCALE: String(resolved.bubbleScale ?? defaults.bubbleScale),
        DSH_DAFEIYU_ACTIVITY_LEVEL: String(resolved.activityLevel ?? defaults.activityLevel),
        DSH_DAFEIYU_REDUCED_MOTION: resolved.reducedMotion === true ? '1' : '0',
        DSH_DAFEIYU_SOUND_ENABLED: resolved.soundEnabled !== false ? '1' : '0',
        DSH_DAFEIYU_BUBBLE_MODE: String(resolved.bubbleMode ?? defaults.bubbleMode),
        DSH_DAFEIYU_BUBBLE_STATES: (Array.isArray(resolved.bubbleStates) ? resolved.bubbleStates : defaults.bubbleStates).join(','),
        DSH_DAFEIYU_CLICK_THROUGH: resolved.clickThrough === true ? '1' : '0',
        DSH_DAFEIYU_CLICK_THROUGH_HOTKEY: String(resolved.clickThroughHotkey ?? defaults.clickThroughHotkey),
        DSH_DAFEIYU_WEBUI_URL: String(config.webuiUrl ?? process.env.DSH_DAFEIYU_WEBUI_URL ?? 'http://127.0.0.1:3080/'),
      },
      onSettingsChange: (report) => {
        if (typeof settings.update !== 'function') return
        const patch = {}
        if (Number.isFinite(report.scale)) patch.scale = Math.min(1.4, Math.max(0.55, report.scale))
        if (Number.isFinite(report.bubbleScale)) patch.bubbleScale = Math.min(1.2, Math.max(0.8, report.bubbleScale))
        if (typeof report.reducedMotion === 'boolean') patch.reducedMotion = report.reducedMotion
        // The global hotkey can flip passthrough without the settings page, so
        // the helper reports it back and the host stores the new value.
        if (typeof report.clickThrough === 'boolean') patch.clickThrough = report.clickThrough
        if (Object.keys(patch).length === 0) return
        void Promise.resolve(settings.update(patch)).catch((error) => {
          logger.warn?.(`dsh-dafeiyu failed to persist helper settings: ${error instanceof Error ? error.message : String(error)}`)
        })
      },
    }, logger)
    // Mirror every companion message to in-page subscribers without changing
    // what the helper receives; the wrap is per-runtime and dies with it.
    const deliver = bridge.send.bind(bridge)
    bridge.send = (message) => {
      deliver(message)
      eventStream.broadcast(message)
    }
    reducer = new CompanionReducer({ includeSubagents: resolved.includeSubagents === true })
    bridge.start()
    bridge.send(createMessage(CompanionMessageKind.HELLO, {
      state: CompanionState.IDLE,
      host: 'deepseek-harness',
      pluginVersion: pkg.version,
      message: 'BigFish connected to DSH',
    }))
    bridge.send(createMessage(CompanionMessageKind.STATE, {
      state: CompanionState.IDLE,
      phase: 'plugin-start',
      stage: '等待任务',
      message: '我在这儿等新任务哦',
      detail: 'DSH · 等待下一次任务',
    }))
    logger.info?.('dsh-dafeiyu companion bridge started')
  }

  startRuntime(settings.get())

  // The companion intentionally observes every DSH session. Loader entries may
  // live inside a scoped composition, so use the unscoped root bus and dispose
  // the registrations explicitly with this plugin's lifecycle.
  // Never let an exception from this optional companion escape into the shared
  // session bus: a throw here could stop every other subscriber from seeing
  // the event, which would look exactly like "installing the pet broke other
  // plugins".
  const offEvent = eventCtx.on('session/event', (session, event) => {
    if (!bridge || !reducer) return
    try {
      for (const message of reducer.handle(session, event)) bridge.send(message)
    } catch (error) {
      logger.error?.('dsh-dafeiyu failed to handle session event', error)
    }
  }, { global: true })
  const offDisposed = eventCtx.on('session/disposed', (session) => {
    if (!bridge || !reducer) return
    try {
      for (const message of reducer.disposeSession(session)) bridge.send(message)
    } catch (error) {
      logger.error?.('dsh-dafeiyu failed to dispose session', error)
    }
  }, { global: true })

  const unwatch = settings.watch((next) => {
    // Disabling is the only path that tears the helper down.  Every other
    // setting is applied live through a CONFIG message, so sliders never
    // restart the pet.  Starting a previously-disabled runtime is debounced
    // to avoid spawning repeatedly while settings settle.
    try {
      if (next.enabled === false) {
        if (restartTimer) {
          clearTimeout(restartTimer)
          restartTimer = undefined
        }
        stopRuntime('settings-change')
        return
      }
      if (!bridge) {
        scheduleRestart(next)
        return
      }
      if (restartTimer) {
        clearTimeout(restartTimer)
        restartTimer = undefined
      }
      applyLiveSettings(next)
    } catch (error) {
      // This callback runs inside the host's settings dispatch; a throw here
      // would take the host's settings service down with the pet.
      logger.error?.(`dsh-dafeiyu failed to apply settings: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (httpCtx) => {
      httpCtx.effect(
        () => httpCtx.webServer.register({ kind: 'exact', path: CONFIG_ENDPOINT, handler: createConfigHandler(settings) }),
        'dsh-dafeiyu: local settings endpoint',
      )
      httpCtx.effect(
        () => httpCtx.webServer.register({ kind: 'exact', path: EVENTS_ENDPOINT, handler: createEventsHandler(eventStream) }),
        'dsh-dafeiyu: local event stream',
      )
      const assetRoutes = createAssetRoutes()
      if (assetRoutes) {
        httpCtx.effect(
          () => httpCtx.webServer.register({ kind: 'exact', path: MANIFEST_ENDPOINT, handler: assetRoutes.manifestHandler }),
          'dsh-dafeiyu: local manifest endpoint',
        )
        httpCtx.effect(
          () => httpCtx.webServer.register({ kind: 'exact', path: FRAME_ENDPOINT, handler: assetRoutes.frameHandler }),
          'dsh-dafeiyu: local frame endpoint',
        )
      }
    })
  }
  ctx.effect(() => () => {
    if (restartTimer) clearTimeout(restartTimer)
    restartTimer = undefined
    offEvent?.()
    offDisposed?.()
    unwatch()
    settings.dispose?.()
    stopRuntime('dsh-host-stop')
  })
}

export function apply(ctx, config = {}) {
  if (typeof ctx.inject === 'function') {
    ctx.inject(['settings'], (settingsCtx) => mount(settingsCtx, config, ctx))
    return
  }
  mount(ctx, config)
}

export {
  CompanionMessageKind,
  CompanionReducer,
  CompanionState,
  HelperProcess,
  createLiveSettingsScope,
  publicConfig,
}
