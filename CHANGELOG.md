# Changelog

## Unreleased

### Added

- Native Linux x64 Helper packaged with PyInstaller as `runtime/bin/linux-x64/dsh-dafeiyu-helper`
- `npm run build:helper:linux` and a platform-dispatching `npm run build:helper`
- Linux launch path in the plugin: use the bundled Linux Helper instead of requiring a system Python
- Prefer X11/`xcb` on Wayland desktops that still provide `DISPLAY`, falling back to Wayland if `libxcb-cursor0` is missing
- Cross-platform `npm run test:python` / Helper source scripts that prefer the project `venv`

### Changed

- Ordinary Linux is now a desktop display target; WSL2 still uses the Windows Helper through `cmd.exe`
- Packaged-helper smoke tests pick the current platform binary by default

### Release engineering

- Added GitHub Actions trusted publishing: the Windows Helper is built and smoke-tested on Windows,
  while npm publishing uses short-lived OIDC credentials instead of local npm login state
- Added retry-safe npm archive verification and automatic GitHub Release attachment publishing

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
