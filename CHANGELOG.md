# Changelog

## Unreleased

### Added

- Display the reasoning effort that DSH actually applies to each request in the companion status detail, and keep it visible as the task moves between thinking, tool use, and waiting states.
- Add four community-contributed dragging poses and a short release, dizzy, and protest reaction sequence, with reduced-motion fallback and interruption when the pet is grabbed again.
- Bring the native macOS Helper to feature parity for that drag-release reaction sequence, including safe cancellation when reduced motion is enabled or the pet is grabbed again.

### Fixed

- WSL visual mode now caches the bundled Windows Helper under the Windows user's local app-data directory before launching it. Re-enabling the pet no longer makes Windows repeatedly read and unpack the large PyInstaller executable through `\\wsl.localhost`; cache failures still fall back to the packaged Helper.

## 0.1.5

### Fixed

- Bundled the plugin's runtime schema dependencies so DSH profiles can load installs whose package directory is linked from outside the profile tree.
- Bounded Helper IPC buffering under write backpressure and stopped repeated post-readiness crashes after a finite retry budget, preventing stalled Helpers from causing unbounded memory or process churn.

## 0.1.4

### Added

- Linux x64 desktop support with a bundled, Python-free Helper (official binary built on Ubuntu 22.04 / glibc 2.35; desktop verified on Ubuntu 24.04 / glibc 2.39), XDG layout persistence, and X11/Wayland platform selection.
- Linux Helper build, visual smoke test, and final npm-archive validation in CI and the trusted release workflow.
- Native macOS Helper built with Swift and AppKit as a universal arm64/x86_64 app for macOS 12+, with no Python runtime requirement.
- Native macOS build, AppKit screenshot/lifecycle smoke tests, universal-architecture and code-signature checks, plus validation of the final assembled npm archive on a macOS runner.

### Changed

- Removed the npm x64-only installation restriction so Apple Silicon Macs can install the universal package.

## 0.1.3

### Fixed

- Plan mode's `exit_plan_mode` approval step now shows the waiting state instead of working.
- Character size, bubble size, and reduced-motion changes made from the desktop context menu now sync back to DSH settings and survive a restart.

### Changed

- Character scaling now supports 55% to 140%, with a 60% mini preset in the desktop context menu.
- Replaced the generic system beep with original, quieter success and error chimes and added a notification-sound setting.

## 0.1.2

Fixes for WSL reliability and project renames.

> Note: the v0.1.1 tag was blocked before npm publishing by a Windows-only test
> (the cmd.exe resolution test asserted a host path). The test is now platform-neutral;
> the same fixes ship here as 0.1.2.

### Fixed

- WSL visual mode now launches the bundled Windows Helper through the absolute
  `C:\Windows\System32\cmd.exe` path (resolved via `wslpath`), falling back to the bare
  name only if that fails. Previously it depended on `cmd.exe` being on the WSL PATH, so
  WSL installs without System32 in PATH could never start the pet.
- The status bubble now shows the current project name after a folder rename instead of
  the stale name frozen in the session header: the freshest working-directory source
  (live session cwd / step projectName) wins over the older header title/name.
- Added regression tests for both fixes.

## 0.1.0

Promoted to stable. Same hardened build that shipped as 0.1.0-alpha.15, now the default
`latest` npm version so plain `dsh plugin add dsh-dafeiyu` installs a DSH rc.7-compatible
release instead of the stale 0.1.0-alpha.6.

## 0.1.0-alpha.15

Fault isolation and robustness hardening so the pet can never take down
other plugins or the whole DSH host.

### Fixed

- Host-side `session/event` and `session/disposed` listeners are now exception-isolated,
  so a single bad event from DSH can no longer throw into the shared bus and stop every
  other subscriber (which previously could present as "installing the pet broke other
  plugins")
- The bundled web client registers its settings card inside a fault-isolated guard: if DSH
  changes the slot contract again, only the BigFish card is lost instead of the whole WebUI
  failing to load
- Helper pipe errors (EPIPE) are now swallowed on stdin/stdout/stderr so a dead helper can
  never crash the DSH host process with an unhandled `error` event
- The bounded-restart guard now also covers helpers that spawn successfully but die before
  sending `READY`, instead of only missing/broken binaries (no more unbounded restart loops)
- README download links point at `/releases` instead of `/releases/latest`, which returned
  404 while every published release is a pre-release

### Release engineering

- Added GitHub Actions trusted publishing: the Windows Helper is built and smoke-tested on Windows,
  while npm publishing uses short-lived OIDC credentials instead of local npm login state
- Added retry-safe npm archive verification and automatic GitHub Release attachment publishing

## 0.1.0-alpha.13



Bug fixes and DSH rc.7 compatibility hardening.



### Fixed



- Helper now clears a failed spawn and schedules a restart, so a missing/broken Helper no longer leaves the plugin wedged

- Added `approval/asked` / `approval/decided` handling so permission approvals show a “等待审批” desktop prompt instead of staying on “工作中”

- `pluginVersion` now reads from `package.json` instead of a stale hardcoded version

- README current-version badges updated

- Added a regression test that actually exercises the DSH rc.7 keyed slot registration



## 0.1.0-alpha.14



Reliability hardening.



### Fixed



- Helper start failures are now bounded: after `maxStartFailures` (default 5) consecutive failed spawns the plugin stops retrying instead of looping forever, protecting DSH and logs from a missing/broken Helper

- Added regression coverage for the bounded retry behavior



## 0.1.0-alpha.12



Loader compatibility fix.



### Fixed



- Updated `cordis.patch.yml` to include the current plugin config fields (`bubbleScale`, `bubbleMode`, `bubbleStates`), reducing the chance of `failed to apply loader entry` after DSH Harness updates

- Added the required `key: 'dsh-dafeiyu'` when registering the `settings.plugin.item` slot, fixing DSH rc.7 `requires options.key` loader failures



## 0.1.0-alpha.11



Bubble visibility modes.



### Added



- New “气泡显示” setting in the DSH plugin panel: 常驻显示 / 完全隐藏 / 自定义显示状态

- Custom mode lets users choose exactly which DSH states show the status bubble

- When bubble is hidden, the Helper window shrinks to the character only



### Changed



- Supersedes the simple global hide-bubble idea with a three-mode design that also covers Issue #15

## 0.1.0-alpha.10

WSL2 support and Issue #12 desktop interaction enhancements.

### Added

- WSL2 support: allow installation on Linux and run the bundled Win32 Helper through WSL interop ([#8](https://github.com/QCYTSN/dsh-dafeiyu/pull/8))
- Right-click “打开 WebUI” action to reopen the DSH WebUI from the desktop pet ([#12](https://github.com/QCYTSN/dsh-dafeiyu/issues/12))
- Completion/error alert feedback: beep plus a brief window shake on SUCCESS/ERROR pulses ([#12](https://github.com/QCYTSN/dsh-dafeiyu/issues/12))
- Multi-task status card: when multiple DSH sessions are active, the pet bubble lists the running tasks and their states ([#12](https://github.com/QCYTSN/dsh-dafeiyu/issues/12))

### Changed

- Removed the npm `os` restriction so WSL2 installs are accepted while retaining the x64 CPU requirement
- WSL2 launches the Helper through `cmd.exe`, so npm's Linux executable bit is not required
- The helper now snapshots and replays the multi-task list after a restart

### Update

Fully exit DSH, then run:

```powershell
dsh plugin --profile web update dsh-dafeiyu@alpha
```

Restart DSH after the update.

## 0.1.0-alpha.9

Windows drag-stability hotfix release.

### Fixed

- Removed procedural floating motion from the single-frame dragging pose
- Switched into and out of the dragging pose atomically instead of crossfading through an already-painted frame
- Paused animation and idle-micro timers while dragging so timer repaints no longer compete with Windows mouse-move repaints
- Restored the latest live Agent state immediately after release, including state changes received during the drag ([#10](https://github.com/QCYTSN/dsh-dafeiyu/issues/10))

### Validation

- Added regression coverage for drag transitions, live state updates during dragging, and the stable dragging asset contract
- Rebuilt the Windows x64 Helper and passed its packaged Qt visual smoke test
- Completed five consecutive native-window drag/release cycles without a crash or stale dragging state

### Update

Fully exit DSH, then run:

```powershell
dsh plugin --profile web update dsh-dafeiyu@alpha
```

Restart DSH after the update. The current DSH Host does not support replacing the whole plugin package while it is still running.

## 0.1.0-alpha.8

Packaging and DSH event-state hotfix release.

### Fixed

- Restored the Windows visual Helper after `0.1.0-alpha.7` was published without PySide6/Qt
- Stopped thinking-card copy from changing on every streamed assistant chunk ([#5](https://github.com/QCYTSN/dsh-dafeiyu/issues/5))
- Added real DSH `tool/result` call-ID paths so completed tools no longer leave stale working stages ([#6](https://github.com/QCYTSN/dsh-dafeiyu/issues/6))
- Added a dedicated waiting state for `ask_user_question`, `request_user_input`, and equivalent user-question tools ([#6](https://github.com/QCYTSN/dsh-dafeiyu/issues/6))

### Release safeguards

- The Windows build now fails before packaging unless the selected Python can import both PyInstaller and PySide6
- Every packaged Helper must start, complete the protocol handshake, render a real Qt snapshot with bundled assets, and shut down cleanly
- The public incident and resolution are tracked in [#7](https://github.com/QCYTSN/dsh-dafeiyu/issues/7)

### Update

Fully exit DSH, then run:

```powershell
dsh plugin --profile web update dsh-dafeiyu@alpha
```

Restart DSH after the update. Existing `0.1.0-alpha.7` users should update directly to this version.

## 0.1.0-alpha.7

> **Known broken release:** the published Windows Helper omitted PySide6/Qt. The WebUI settings
> panel loads, but the desktop companion cannot appear. Use `0.1.0-alpha.6` or update to
> `0.1.0-alpha.8`. See [#7](https://github.com/QCYTSN/dsh-dafeiyu/issues/7).

Animation and live-settings refinement release.

### Highlights

- 50 FPS standard rendering with 25 FPS retained for reduced-motion mode
- Subpixel positioning and smooth pixmap transforms for less stepped movement
- Short, non-flashing crossfades between larger pose and animation-frame changes
- Light procedural bob, sway, rotation, and breathing motion
- Multi-frame actions run roughly 10% faster while retaining readable character acting
- Independent live controls for character and status-card scale without restarting the Helper
- Live subagent preference changes preserve the active top-level project state

### Update

Fully exit DSH, then run:

```powershell
dsh plugin --profile web update dsh-dafeiyu@alpha
```

For a local DSH installation, run the equivalent command from its directory:

```powershell
pnpm exec dsh plugin --profile web update dsh-dafeiyu@alpha
```

Restart DSH after the update. Whole-package hot replacement is not supported by the current
DSH Host; live configuration changes remain available without restarting.

## 0.1.0-alpha.6

First public Windows Alpha of DSH BigFish / DSH 大肥鱼.

### Highlights

- Native transparent, frameless, always-on-top Windows companion owned by DSH
- Real DSH session states: idle, thinking, working, waiting, success, and error
- Project status card with project directory, current phase, active todo, and real todo progress
- Friendly Simplified Chinese status copy and 49-frame character runtime
- DSH WebUI settings for enable/disable, scale, activity, reduced motion, and subagents
- Helper heartbeat, crash restart, snapshot replay, and automatic exit with the DSH Host
- Bilingual Chinese/English GitHub documentation

### Install the Alpha

```powershell
dsh plugin --profile web add dsh-dafeiyu@alpha
```

If DSH is installed locally rather than globally:

```powershell
pnpm exec dsh plugin --profile web add dsh-dafeiyu@alpha
```

### Current limitations

- Windows 10/11 x64 only
- Settings and desktop status copy are currently Simplified Chinese
- Numeric progress requires a structured todo list from DSH
- Community Electron clients are not part of the supported compatibility scope

Code is MIT-licensed. Bundled character artwork has separate terms documented in
[ASSET_LICENSE.md](ASSET_LICENSE.md). This is an unofficial fan-made project and is not
affiliated with or endorsed by DeepSeek.
