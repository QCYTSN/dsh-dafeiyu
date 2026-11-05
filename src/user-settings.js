// Host-side fallback for companion settings chosen from the native context
// menu. DSH's settings service can reject a write (for example when its
// config editor does not expose the bundle-patch entry); the helper would then
// restart with the old host values. This store remembers only the fields the
// user picked in the menu and the host values they were picked against, so the
// choice survives a helper or DSH restart while a later host-side change still
// wins. It is a fallback, not a replacement for settings.update().
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export const USER_SETTING_FIELDS = Object.freeze(['scale', 'bubbleScale', 'reducedMotion'])

export function defaultUserSettingsPath({ env = process.env, home = homedir() } = {}) {
  const override = env.DSH_DAFEIYU_USER_SETTINGS
  if (override) return resolve(override)
  const dshHome = env.DSH_HOME || join(home, '.dsh')
  return join(dshHome, 'dsh-dafeiyu', 'user-settings.json')
}

function clampField(field, value) {
  if (field === 'scale' && typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(1.4, Math.max(0.3, value))
  }
  if (field === 'bubbleScale' && typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(1.2, Math.max(0.8, value))
  }
  if (field === 'reducedMotion' && typeof value === 'boolean') return value
  return undefined
}

function readOverrides(file, readFile) {
  let parsed
  try {
    parsed = JSON.parse(readFile(file, 'utf8'))
  } catch {
    return {}
  }
  const raw = parsed?.overrides
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const overrides = {}
  for (const field of USER_SETTING_FIELDS) {
    const entry = raw[field]
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const value = clampField(field, entry.value)
    if (value === undefined) continue
    const host = clampField(field, entry.host)
    if (host === undefined) continue
    overrides[field] = { value, host }
  }
  return overrides
}

/**
 * Create the override store. Invalid or unreadable files are ignored; a failed
 * save is reported through `warn` but never breaks the plugin.
 */
export function createUserSettingsStore(file, {
  readFile = readFileSync,
  writeFile = writeFileSync,
  moveFile = renameSync,
  makeDirectory = mkdirSync,
  warn = () => {},
} = {}) {
  const overrides = file ? readOverrides(file, readFile) : {}

  const persist = () => {
    if (!file) return
    const temporary = `${file}.${process.pid}.tmp`
    try {
      makeDirectory(dirname(file), { recursive: true })
      writeFile(temporary, `${JSON.stringify({ version: 1, overrides }, null, 2)}\n`, 'utf8')
      moveFile(temporary, file)
    } catch (error) {
      warn(`unable to save native menu settings fallback: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const clear = (fields) => {
    let changed = false
    for (const field of fields) {
      if (overrides[field] === undefined) continue
      delete overrides[field]
      changed = true
    }
    if (changed) persist()
    return changed
  }

  const observeHost = (host = {}) => {
    const fields = []
    for (const field of USER_SETTING_FIELDS) {
      const entry = overrides[field]
      if (entry === undefined) continue
      // The host may still hold the baseline (a rejected or silently lost
      // write) or already hold exactly the menu value (the echo of a write
      // that may or may not have reached disk). Both keep the fallback alive.
      // Any third value means the user changed the setting elsewhere.
      if (Object.is(host[field], entry.host) || Object.is(host[field], entry.value)) continue
      fields.push(field)
    }
    clear(fields)
  }

  return {
    path: file,
    apply(host = {}) {
      observeHost(host)
      const result = { ...host }
      for (const field of USER_SETTING_FIELDS) {
        const entry = overrides[field]
        if (entry !== undefined) result[field] = entry.value
      }
      return result
    },
    observeHost,
    record(patch = {}, host = {}) {
      let changed = false
      for (const field of USER_SETTING_FIELDS) {
        const value = clampField(field, patch[field])
        if (value === undefined) continue
        const baseline = clampField(field, host[field])
        if (baseline === undefined) continue
        if (Object.is(value, baseline)) {
          // The menu picked the same value the host already has; no fallback
          // is needed and any older override for this field should go away.
          if (overrides[field] !== undefined) {
            delete overrides[field]
            changed = true
          }
          continue
        }
        overrides[field] = { value, host: baseline }
        changed = true
      }
      if (changed) persist()
      return changed
    },
    clear,
    snapshot() {
      return JSON.parse(JSON.stringify(overrides))
    },
  }
}
