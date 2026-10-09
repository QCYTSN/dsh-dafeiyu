# Acceptance records

> Historical validation, not an installation guide. Use the [latest stable
> release](https://github.com/QCYTSN/dsh-dafeiyu/releases/latest) and the current
> [updating guide](UPDATING.md). This record is retained in GitHub and excluded
> from the installable package.

## 2026-10-07 · Animation handoffs / 0.1.16

- Verified all 2,600 previously installed animation frames against the repository;
  the old character's archived PNGs were not referenced by the runtime.
- Verified the resulting 16 clips / 3,444 frames against the pinned upstream
  source windows, including complete touch, idle, and landing sequences.
- Passed 109 JavaScript, 49 Python, and 33 Swift tests in
  [main CI](https://github.com/QCYTSN/dsh-dafeiyu/actions/runs/37580317168).
- Passed all platform builds, final-archive checks, and trusted publishing in
  [release CI](https://github.com/QCYTSN/dsh-dafeiyu/actions/runs/37580636627).
- Installed the public npm package into the existing Windows Desktop
  0.2.0-rc.2 profile; confirmed settings were retained, balance remained ready,
  and the new activity intervals appeared in the plugin detail page.
- Tested real Desktop clicks and dragging and restored the companion's position.
  Controlled native-window playback also verified task interruption, full landing,
  and completion messages across repeated idle snapshots.

## 2026-10-06 · Official Windows Desktop / 0.1.15

Tested the existing DeepSeek Harness Desktop **0.2.0-rc.2** installation on
Windows using its own `desktop` profile and in-app Plugins page.

- Installed a local 0.1.15 archive through Add plugin and Enable now. The
  bundle ran and its native companion appeared without a separate npm or
  Python installation by the user.
- Added `plugins.bundle.config` after discovering the previous settings-tab
  registration did not appear in the installed package's detail page.
- Queried the signed-in account through DSH's account service. Fixed support
  for its full decimal precision and exponent notation. The recharge amount
  matched DSH's own account page at that page's displayed precision.
- Visually checked the native status card's balance footer and the settings
  balance table. Private account screenshots and amounts are not included here.
- Changed reduced motion in the app and verified the Host accepted it live.
  Configuration was retained across a complete app restart.
- Disabled the companion in its settings and observed zero Helper processes;
  enabled it again and observed the native window return.
- The native menu automatically offered Open DSH Desktop and opened the
  existing desktop application through `dsh://open`.
- Complete app shutdown left zero Helper processes.
- After the release workflow succeeded, installed the public npm package
  through the same Add plugin UI. The bare package name initially selected
  0.1.14 from the default source; specifying `dsh-dafeiyu@0.1.15` installed
  0.1.15 successfully. The profile now records a registry version rather than
  a local test archive.
- All **105 JavaScript tests** passed locally, including the new decimal and
  current / older slot registration regression checks. The preceding main
  build also passed 42 Python and 36 Swift tests in CI.
- [0.1.15 release CI](https://github.com/QCYTSN/dsh-dafeiyu/actions/runs/37480096423)
  passed all three platform builds, final archive checks, npm trusted
  publishing and GitHub Release creation. npm's public `latest` tag was
  verified as 0.1.15 after propagation.

This acceptance does not include a new paid model task, a real Desktop API-key
account, or macOS multi-monitor testing. API-key responses and session events
remain covered by the isolated tests below.

## 2026-10-06 · Balance and dual-client branch (Unreleased)

Baseline: GitHub `main` at `9c0588c` / 0.1.14. Current assets remain the
`dsh-pet` 24 fps set. No npm release or version tag was published.

- 104 JavaScript, 42 Python and 36 Swift tests passed in
  [GitHub CI](https://github.com/QCYTSN/dsh-dafeiyu/actions/runs/37465829356).
- Published DSH 0.2.0-rc.2 Loader / SettingsForms integration passed exact
  namespace, live edit, stored patch and remount checks with isolated storage.
- A real browser rendered the settings panel with controlled Host responses:
  initial balance, source switching, stale SSE data and disabling the feature.
- Windows Qt Helper was built locally, displayed sample balance in its native
  window and passed shutdown / stdin EOF checks before and after npm extraction.
  Build paths were isolated to prevent unrelated UCRT DLLs entering the bundle.
- Linux x64 and macOS Universal Helpers built and passed graphical snapshots
  and stdin EOF checks before and after npm extraction. macOS arm64 / x86_64
  slices, bundle version and ad-hoc signature were verified in CI.
- Real user credentials were not queried. Official Desktop's complete user
  flow and macOS multi-monitor dragging / font appearance need real-machine
  follow-up. Source detection and `dsh://open` navigation were tested in isolation.

## Windows MVP acceptance baseline

Date: 2026-08-14

### Environment

- Windows 10 build 26200
- Node.js 24.15.0
- DeepSeek Harness `@deepseek-ai/dsh@0.1.0-rc.6`
- PySide6 6.11.1, PyInstaller 6.21.0
- Package candidate: `dsh-dafeiyu@0.1.0-alpha.4`

`0.1.0-alpha.5` 在同一 Windows 环境中追加验证了：

- 结构化项目名、当前待办和 `completed/total` 进度传递
- 分析、查找、实现、验证、等待、完成和错误状态文案轮换
- 两层白色圆角状态卡、柔和阴影、文本截断与状态色图标
- 源码 Helper 与预构建 Windows Helper 的真实透明窗口截图
- GitHub Release `.tgz` 覆盖更新、旧包回退和卸载说明

`0.1.0-alpha.6` 补充了中文和英文 GitHub 用户文档、两张 DSH 实机截图及五种
桌面状态图；运行时代码仅同步插件版本号，沿用 alpha.5 已验收的 Windows Helper。

### Functional acceptance

- Real DSH session sequence: `IDLE → THINKING → THINKING → WORKING → SUCCESS`.
- DSH Web settings card rendered with three checkboxes, one size slider and one activity selector.
- The WebUI successfully disabled and re-enabled the helper; the choice was persisted under
  `dsh-dafeiyu` in DSH's own `settings.yaml`.
- The prebuilt helper rendered the bundled 49-frame asset manifest without Python installed.
- Forced DSH Host termination and normal helper shutdown both left zero helper processes.
- Browser console, DSH Host stderr and helper stderr were empty in the final acceptance runs.

### Package baseline

- npm archive: approximately 54.2 MB compressed and 54.6 MB unpacked.
- Windows helper executable: approximately 50.9 MB.

### Runtime baseline

- Warm Windows helper readiness: 1.195 seconds.
- PyInstaller parent and visual child combined working set: 74.2 MB.
- Combined private memory: 32.1 MB.
- Five-second idle CPU sample, normalized across logical processors: 0.14%.
- One first-run Windows security scan delayed readiness beyond 30 seconds. The protocol uses an
  explicit `ready` handshake and allows 60 seconds before treating startup as failed.

These measurements are a local alpha baseline, not a cross-machine performance guarantee.
