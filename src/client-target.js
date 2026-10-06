export function resolveClientTarget(config = {}, runtime = process) {
  const target = config.clientTarget ?? 'auto'
  const desktop = target === 'desktop' || (target === 'auto' && (
    runtime.argv?.some((arg) => /dsh-desktop-host[\\/]/.test(arg))
    || /(?:^|[\\/])profiles[\\/]desktop[\\/]?$/.test(runtime.cwd())
  ))
  return {
    target: desktop ? 'desktop' : 'web',
    url: config.webuiUrl ?? runtime.env?.DSH_DAFEIYU_WEBUI_URL
      ?? (desktop ? 'dsh://open' : 'http://127.0.0.1:3080/'),
    label: desktop ? '打开 DSH 桌面端' : '打开 DSH WebUI',
  }
}
