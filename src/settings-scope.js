import Schema from '@deepseek-ai/schemastery'

// DSH 0.2 projects volatile Config fields into settings; older hosts register
// namespaces explicitly. Keep both behind the same small runtime interface.
export function plainConfig(config) {
  if (config && typeof config.get === 'function') return plainConfig(config.get())
  if (Array.isArray(config)) return config.map(plainConfig)
  if (config && typeof config === 'object') {
    return Object.fromEntries(Object.entries(config).map(([key, value]) => [key, plainConfig(value)]))
  }
  return config
}

export function createSettingsScope(ctx, schema, config, normalize) {
  const base = normalize(plainConfig(config))
  if (typeof ctx.settings?.register === 'function') {
    // Older settings own plain values and serialize them directly. Their
    // registered schema must not return the new Loader's live references.
    const legacySchema = Schema.object(Object.fromEntries(Object.entries(schema.dict)
      .map(([key, field]) => [key, field.extra('volatile', false)])))
    return ctx.settings.register('dsh-dafeiyu', legacySchema, { base, applies: 'live' })
  }
  const service = ctx.settings
  const namespace = ctx.fiber?.entry?.options?.id ?? 'dsh-dafeiyu'
  const watchers = new Set()
  let value = base
  let reading = false
  const read = () => {
    if (reading) return value
    reading = true
    try {
      const entry = service?.describe?.().find((row) => row.ns === namespace)
      // The user layer also covers hosts that persist a patch before updating
      // their running descriptor. Never guess another plugin's namespace.
      return normalize({ ...plainConfig(config), ...entry?.value, ...entry?.user })
    } finally {
      reading = false
    }
  }
  const adopt = (next) => {
    if (JSON.stringify(next) === JSON.stringify(value)) return
    value = next
    for (const watcher of watchers) watcher(value)
  }
  const refresh = () => {
    try { adopt(read()) } catch (error) { ctx.logger?.warn?.('dsh-dafeiyu settings refresh failed', error) }
  }
  const offDocument = ctx.on?.('settings/document-updated', (ns) => {
    if (ns === namespace && !reading) refresh()
  }, { global: true })
  const offVolatile = ctx.on?.('loader/volatile-update', refresh)
  return {
    get: () => value,
    watch(callback) {
      watchers.add(callback)
      return () => watchers.delete(callback)
    },
    ...(typeof service?.update === 'function' ? {
      async update(patch) {
        await service.update(namespace, patch)
        adopt(normalize({ ...value, ...patch }))
      },
    } : {}),
    dispose() {
      offDocument?.()
      offVolatile?.()
      watchers.clear()
    },
  }
}
