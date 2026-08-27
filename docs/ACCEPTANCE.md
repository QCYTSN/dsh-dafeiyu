# Windows MVP acceptance baseline

Date: 2026-08-14

## Environment

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

## Functional acceptance

- Real DSH session sequence: `IDLE → THINKING → THINKING → WORKING → SUCCESS`.
- DSH Web settings card rendered with three checkboxes, one size slider and one activity selector.
- The WebUI successfully disabled and re-enabled the helper; the choice was persisted under
  `dsh-dafeiyu` in DSH's own `settings.yaml`.
- The prebuilt helper rendered the bundled 49-frame asset manifest without Python installed.
- Forced DSH Host termination and normal helper shutdown both left zero helper processes.
- Browser console, DSH Host stderr and helper stderr were empty in the final acceptance runs.

## Package baseline

- npm archive: approximately 54.2 MB compressed and 54.6 MB unpacked.
- Windows helper executable: approximately 50.9 MB.

## Runtime baseline

- Warm Windows helper readiness: 1.195 seconds.
- PyInstaller parent and visual child combined working set: 74.2 MB.
- Combined private memory: 32.1 MB.
- Five-second idle CPU sample, normalized across logical processors: 0.14%.
- One first-run Windows security scan delayed readiness beyond 30 seconds. The protocol uses an
  explicit `ready` handshake and allows 60 seconds before treating startup as failed.

These measurements are a local alpha baseline, not a cross-machine performance guarantee.
