# Acceptance records

> Historical validation, not an installation guide. Use the [latest stable
> release](https://github.com/QCYTSN/dsh-dafeiyu/releases/latest) and the current
> [updating guide](UPDATING.md). This record is retained in GitHub and excluded
> from the installable package.

## 2026-11-02 · macOS acceptance / task navigation rebased on 0.1.23

Baseline: `0843238` / official 0.1.23. This unreleased PR only adds task-row
navigation. The published Python dependency diagnostics and packaged-smoke
layout isolation are unchanged from the baseline.

**NOT READY for full acceptance; PR #97 remains a draft.** The maintainer closed
#81 after the visual checks. Official-package #83 boundary checks passed and
await maintainer confirmation. PR navigation and the regressions below passed,
but no-client feedback, the closed-session race and PR multi-display acceptance
remain incomplete. Official 0.1.23 does not contain task-row navigation.

- Environment: DSH Desktop `0.2.0-rc.2`, macOS 27.0.1 (26A434), Apple M5 /
  arm64; `bubbleScale=0.8`, character scale `0.85`, persistent bubbles and
  `webOverlay=false`. Only the built-in display is connected for the November 2
  PR tests. SSN-24 was connected for the November 1 official-package tests.
- Issue #81, official `dsh-dafeiyu@0.1.23`: actual A/B/C sessions entered
  `ask_user_question` waiting state. The three-task card title/rows and the
  remaining A status card title/body after answering B/C were legible without
  clipping or overlap. Balance display was temporarily disabled for public
  screenshots, then restored. The maintainer has closed the issue.
  [Status card](https://raw.githubusercontent.com/bosprimigenious/dsh-dafeiyu/0d86da54bfa8e1486d5550b706e8c20bf24cd0be/docs/acceptance/2026-11-01/official-0.1.23-status-bubble-0.8.png),
  [three-task card](https://raw.githubusercontent.com/bosprimigenious/dsh-dafeiyu/0d86da54bfa8e1486d5550b706e8c20bf24cd0be/docs/acceptance/2026-11-01/official-0.1.23-three-tasks-bubble-0.8.png),
  [issue report](https://github.com/QCYTSN/dsh-dafeiyu/issues/81#issuecomment-6554050106).
- Issue #83, official 0.1.23: real partial-offscreen dragging retained the pet
  position through window/content changes. On November 2, the right-offscreen
  anchor stayed at `(1510,506)` before quit (00:41:13), after restart (00:41:42),
  during real C-session waiting (00:42:21), in full-screen (00:42:31), and after
  exit (00:42:52); times are UTC+8, anchors are AppKit points. The Helper PID
  changed from 95043 to 46712. The November 1 two-way built-in → SSN-24 →
  built-in drag retained anchors `(1514,430)` → `(724,1480)` → `(1514,430)`.
  Earlier ambiguous fullscreen/restart attempts remain in the raw log and are
  not counted as passes. The issue remains open for maintainer confirmation.
  [Raw position/window log](https://raw.githubusercontent.com/bosprimigenious/dsh-dafeiyu/7488dfb9ac73bb21b8e7f4f7a41e9b1cb66f5ab3/docs/acceptance/2026-11-02/native-boundary-log.jsonl),
  [restart waiting](https://raw.githubusercontent.com/bosprimigenious/dsh-dafeiyu/7488dfb9ac73bb21b8e7f4f7a41e9b1cb66f5ab3/docs/acceptance/2026-11-02/official-20261102-after-restart-waiting.png),
  [full-screen DSH](https://raw.githubusercontent.com/bosprimigenious/dsh-dafeiyu/7488dfb9ac73bb21b8e7f4f7a41e9b1cb66f5ab3/docs/acceptance/2026-11-02/official-20261102-fullscreen-dsh.png),
  [full-screen native card](https://raw.githubusercontent.com/bosprimigenious/dsh-dafeiyu/7488dfb9ac73bb21b8e7f4f7a41e9b1cb66f5ab3/docs/acceptance/2026-11-02/official-20261102-fullscreen-pet.png).
- PR build: the tested local arm64 package uses source head
  `b927ec34a09b53a91a43e66152cccc684ecaf647` and navigation implementation
  `1dae5c7`. Its package version is also 0.1.23; it is not the official release.
  Tarball SHA-256:
  `175ffc9e3760fdc1b436ce84f9c14519d898bc775a4eb89af26b74d95ede6f7a`.
- PR real DSH checks passed with the page companion disabled: all three visible
  task rows entered their respective A/B/C sessions; dragging from row 2 by
  40 pt kept session A open; clicking afterward still navigated; the native
  context menu opened/closed; full-screen navigation and exit worked; a click
  through the transparent card/character gap collapsed the underlying question
  card. Ending/archiving C removed its row; clicking the unused third-row region
  relative to the resized card did not reopen C. These used real sessions,
  without synthetic Host events.
  [Three rows](https://raw.githubusercontent.com/bosprimigenious/dsh-dafeiyu/7488dfb9ac73bb21b8e7f4f7a41e9b1cb66f5ab3/docs/acceptance/2026-11-02/pr-20261102-three-tasks.png),
  [row 1 → A](https://raw.githubusercontent.com/bosprimigenious/dsh-dafeiyu/7488dfb9ac73bb21b8e7f4f7a41e9b1cb66f5ab3/docs/acceptance/2026-11-02/pr-20261102-row1-A-dsh.png),
  [row 2 → B](https://raw.githubusercontent.com/bosprimigenious/dsh-dafeiyu/7488dfb9ac73bb21b8e7f4f7a41e9b1cb66f5ab3/docs/acceptance/2026-11-02/pr-20261102-row2-B-dsh.png),
  [row 3 → C](https://raw.githubusercontent.com/bosprimigenious/dsh-dafeiyu/7488dfb9ac73bb21b8e7f4f7a41e9b1cb66f5ab3/docs/acceptance/2026-11-02/pr-20261102-row3-C-dsh.png),
  [drag remains on A](https://raw.githubusercontent.com/bosprimigenious/dsh-dafeiyu/7488dfb9ac73bb21b8e7f4f7a41e9b1cb66f5ab3/docs/acceptance/2026-11-02/pr-20261102-drag-row2-stays-A.png),
  [context menu](https://raw.githubusercontent.com/bosprimigenious/dsh-dafeiyu/7488dfb9ac73bb21b8e7f4f7a41e9b1cb66f5ab3/docs/acceptance/2026-11-02/pr-20261102-right-menu.png),
  [full-screen navigation](https://raw.githubusercontent.com/bosprimigenious/dsh-dafeiyu/7488dfb9ac73bb21b8e7f4f7a41e9b1cb66f5ab3/docs/acceptance/2026-11-02/pr-20261102-fullscreen-row1-A.png),
  [click-through](https://raw.githubusercontent.com/bosprimigenious/dsh-dafeiyu/7488dfb9ac73bb21b8e7f4f7a41e9b1cb66f5ab3/docs/acceptance/2026-11-02/pr-20261102-transparent-click-through.png),
  [C removed](https://raw.githubusercontent.com/bosprimigenious/dsh-dafeiyu/7488dfb9ac73bb21b8e7f4f7a41e9b1cb66f5ab3/docs/acceptance/2026-11-02/pr-20261102-C-archived-two-rows.png).
- Incomplete: the real reveal SSE was blocked in DevTools, but none of the seven
  native captures contains the specific no-client error message, so that check
  is not a pass. Blocking was removed and a reload restored SSE HTTP 200;
  clicking A navigated again (01:09:47). The `session-unavailable` race has not
  been reproduced in real UI; normal C removal is not evidence for that error
  path. PR cross-display behavior remains untested with only the built-in display
  connected. Windows/Linux manual acceptance was not performed.
- Earlier AX input and screenshot-tool failures are tool limitations, not
  conclusions about the plugin.
- Local checks on navigation head `1dae5c7`: `pnpm install --frozen-lockfile`
  succeeded; `pnpm test`: 144 passed, 0 failed. `pnpm test:python`: 54 tests,
  4 Qt-dependent skips (PySide6 unavailable).
  Re-running both suites on November 2 with the updated acceptance document
  produced the same results (144 passed; 54 tests with 4 skips).
- `swift test` failed: the installed Command Line Tools cannot resolve XCTest.
  `pnpm build:helper:darwin` compiled arm64, then failed linking x86_64 because
  the installed CLT compatibility libraries lack that architecture.
- Recompiled all seven production Swift sources with the script's arm64
  target (`arm64-apple-macosx12.0`) and framework flags. Ad-hoc signature
  verification, packaged visual smoke and stdin-EOF lifecycle checks passed.
  This is an arm64-only local build, not a universal-package success.
  `pnpm pack` failed with bundled dependencies / the isolated linker; packaging
  with `npm pack`, as used by CI, succeeded.
- [CI run 41284227851, attempt 2](https://github.com/QCYTSN/dsh-dafeiyu/actions/runs/41284227851)
  passed all four jobs for `b927ec34a09b53a91a43e66152cccc684ecaf647` after the
  earlier approval attempt returned 403. This result belongs to that existing
  head only. The new documentation commit's CI has not yet been checked.

## 2026-10-29 · Python fallback hint and smoke isolation / 0.1.23

- Passed 137 JavaScript and 54 Python tests locally on Windows. The new
  diagnostics test runs the real Helper with `-S` (no site-packages), observes
  the actual `PySide6 is required for visual mode ...` stderr, and asserts both
  the Helper log and the host error callback carry the install hint.
- Reproduced the smoke runner's layout side effect with a sentinel
  `DSH_DAFEIYU_LAYOUT_PATH`; after the isolation change, the visual smoke and
  stdin-EOF children leave the sentinel unchanged and clean up their temporary
  probe directory.
- Only the two independent fixes from draft PR #97 were taken. The macOS task
  row navigation remains unmerged; its real DSH page end-to-end, multi-display,
  full-screen, and context-menu paths are still unverified.
- Contributor-controlled macOS probes (not run in this session) passed for
  single-screen click-through, partial-offscreen anchors, and font decoupling;
  those issues remain open for multi-display / visual acceptance.

## 2026-10-28 · Approval alerts and settings diagnostics / 0.1.22

- Merged PR #93 only after its second commit passed all four CI jobs. The
  approval scene is opt-in by default, and on macOS the scene selection gates
  both the chime and the notification banner.
- The author verified the Windows Qt path; the macOS banner path was not run on
  a Mac in this session.
- Issue #95 reporter confirmed on macOS 13 / DSH 0.2.1-rc.3 that 0.1.21 keeps a
  context-menu 0.8 choice across helper and full DSH restarts, and that
  `settings.update` wrote `cordis.patch.yml` successfully. The original failure
  could not be reproduced; the issue was closed after the fallback confirmation.
- Adjusted the settings diagnostics so the `settings.describe()` list appears
  only on a real failure and is labelled as settings-page namespaces; the
  activation line no longer prints a list that omits the plugin during
  activation.
- Not verified: macOS approval banner appearance, and the macOS click-through /
  cross-display fixes from 0.1.20 / 0.1.21 still await reporter confirmation.

## 2026-10-27 · Cross-display drag and settings fallback / 0.1.21

- Passed 132 JavaScript and 54 Python tests locally on Windows. New coverage:
  the native-menu override store (baseline matching, host-side change wins,
  persistence, malformed files), the plugin replaying an effective `CONFIG`
  after a failed `settings.update`, and the fallback file contents.
- Reproduced the settings write path on the installed DSH 0.2.1-rc.3 runtime
  with a throwaway `DSH_HOME` and `web` profile: `PATCH
  /plugins/dsh-dafeiyu/config` returned 200 and rewrote the profile
  `cordis.patch.yml` on Windows. The macOS-specific rejection from issue #95 is
  therefore not reproducible here; the new diagnostic log and host-side
  fallback cover it until a report arrives.
- Merged PR #96 after all four CI jobs passed. Its author verified two-way
  cross-display dragging with `CGWindowListCopyWindowInfo` on macOS; this
  Windows machine cannot reproduce that desktop behavior.
- Not verified on macOS hardware: the click-through pointer conversion from
  0.1.20 (#92) and the cross-display drag from #96 still need reporter
  confirmation.

## 2026-10-27 · macOS click-through / 0.1.20

- Passed 125 JavaScript and 54 Python tests locally on Windows. Added Swift
  unit tests for `PetGeometry.isInteractive`, covering the character rectangle,
  the status card, the transparent margins, the gap between card and character,
  and the no-card case.
- The macOS window now becomes mouse-transparent from a 30 Hz pointer check and
  returns to interactive during drags, context menus, and mouse-down. Hidden
  cards no longer reserve a 420 pt wide window.
- **Not verified on macOS hardware**: this machine runs Windows, so the actual
  click-through behaviour and the pointer coordinate conversion are covered
  only by the Swift geometry tests and the macOS CI build. Issue #92 needs a
  real-device confirmation.
- PR #90's Linux Helper CI change passed all four jobs before being merged; it
  changes only `.github/workflows/ci.yml`, not the shipped Helper.
- PR #93's CI passed (JavaScript, Python, Swift, packaged Helpers), but the
  approval-notification issue is still under review; it is not part of 0.1.20.

## 2026-10-26 · Helper diagnostics and architecture selection / 0.1.19

- Passed 125 JavaScript and 54 Python tests locally on Windows, including new
  cases for the cold/warm/retry readiness budgets, bounded log rotation, stale
  `_MEI*` reclamation, child temp-directory injection, the actionable PySide6
  message, and Linux arm64 selecting `linux-arm64` or falling back to Python.
- Launched the packaged Windows Helper through the new default path with
  `--headless`: it reported READY in 888 ms, wrote
  `%LOCALAPPDATA%\dsh-dafeiyu\logs\helper.log`, and ran with
  `%LOCALAPPDATA%\dsh-dafeiyu\tmp` as its extraction directory.
- Not reproduced: the Huorong antivirus cold-scan delay from issue #88 and a
  real Linux arm64 host from issue #91. The timeout and fallback changes are
  covered by controlled tests, not those exact environments. No arm64 Helper is
  built or published yet; arm64 continues through the Python fallback.

## 2026-10-10 · Desktop opening and fixed character position / 0.1.18

- Reproduced opening failure with the existing Windows Desktop 0.2.0-rc.2:
  Qt accepted `dsh://open` but the interface did not appear when the Helper
  inherited `ELECTRON_RUN_AS_NODE=1`. The corrected Helper environment opened
  that same app and restored its minimized main window.
- Reproduced a character anchor changing from y=30 to y=190 after card growth,
  and a notification restoring the rendered character to y=328 while its saved
  anchor remained y=500. These cases now preserve a single anchor.
- Passed 111 JavaScript and 54 Python tests locally, including the real Qt
  window with card changes, balances, task lists, alerts, and drag/landing.
- Kept all frame assets, source provenance, and animation durations unchanged.

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
