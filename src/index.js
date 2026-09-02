// Package entry imported by the DSH plugin loader (see package.json "main").
// Every external runtime dependency must stay behind the dynamic import
// below. A static import would throw ERR_MODULE_NOT_FOUND during module
// resolution when the installed package directory is incomplete (for example
// a `link:` install whose node_modules was never populated) and abort the
// whole DSH plugin tree at boot (issue #39). With this guard the same
// situation degrades into an inert plugin plus a console notice, so DSH and
// all other plugins keep starting normally.
let plugin
try {
  plugin = await import('./plugin.js')
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error)
  console.error(
    '[dsh-dafeiyu] 插件依赖加载失败，大肥鱼本次启动已自动停用（不影响 DSH 其他功能）。\n'
    + `[dsh-dafeiyu] 原因: ${detail}\n`
    + '[dsh-dafeiyu] 修复: 完全退出 DSH 后重新安装 `dsh plugin --profile web add dsh-dafeiyu@latest`，或补齐缺失依赖后重启。',
  )
  plugin = { name: 'dsh-dafeiyu', inject: [], apply() {} }
}

export const name = plugin.name
export const inject = plugin.inject
export const Config = plugin.Config
export const CONFIG_ENDPOINT = plugin.CONFIG_ENDPOINT
export const createConfigHandler = plugin.createConfigHandler
export const CompanionMessageKind = plugin.CompanionMessageKind
export const CompanionReducer = plugin.CompanionReducer
export const CompanionState = plugin.CompanionState
export const HelperProcess = plugin.HelperProcess

export function apply(ctx, config = {}) {
  return plugin.apply(ctx, config)
}
