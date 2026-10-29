# GitHub issue / PR 处理清单

> 此文件记录 issue / PR 的处理依据，不是安装指南。旧版本号用于追溯；安装请使用[当前稳定版](https://github.com/QCYTSN/dsh-dafeiyu/releases/latest)。本记录不随安装包分发。

## 2026-10-29 修复（0.1.23）

- [#91 Python 回退提示](https://github.com/QCYTSN/dsh-dafeiyu/issues/91)：`runtime/helper.py` 实际输出 `PySide6 is required for visual mode (...)`，Host 原 matcher 只认 `ImportError` / `ModuleNotFoundError`，因此 0.1.19–0.1.22 的安装指引没有触发。0.1.23 已改为同时匹配该文本，并新增真实 Helper + `-S` 的回归测试。原生 `linux-arm64` Helper 仍未随包；issue 保持打开等 arm64 复测。
- [PR #97](https://github.com/QCYTSN/dsh-dafeiyu/pull/97)（draft）：只抽取了两个与任务跳转无关的独立修复到 0.1.23——#91 matcher 与冒烟脚本 layout 隔离。任务卡点击跳转（#85）仍留在 draft PR，等待真实 DSH 页面端到端、多屏/全屏/右键菜单与 CI 验证；本轮未合并、未发布该功能。
- #92 / #83 / #81：bosprimigenious 在 macOS 27.0.1 上补了受控 AppKit/真实鼠标探针，单屏命中区、部分离屏锚点、字号解耦均通过；多屏/全屏/右键菜单和完整日常验收仍未覆盖，issue 保持打开。
- #95 已关闭；#80 / #88 / #76 / #39 / #22 仍按原状态等待日志或大改。

## 2026-10-28 发布（0.1.22）

- [#93 提示音独立开关](https://github.com/QCYTSN/dsh-dafeiyu/pull/93)：合并（merge commit 65d5344）。新增 `soundStates`（完成 / 出错 / 等待审批）与 `approval.wav`；macOS 上场景选择同时门控系统横幅，`soundEnabled` 只静音音频；默认只含 `SUCCESS`/`ERROR`，审批提示音需主动开启。四组 CI 全绿；版本号与 CHANGELOG 日期由维护者在发布提交中收口，不跟随 PR 的 0.1.22 预置值。
- [#95 菜单设置重启回退](https://github.com/QCYTSN/dsh-dafeiyu/issues/95)：报告者用 0.1.21 复测确认 helper 重启、DSH 重启均保持 0.8，`settings.update` 返回 200 且写入 `cordis.patch.yml`，无法再复现原始故障；已关闭。按反馈把 `settings.describe()` 列表改为只在失败时打印，并标注为“设置页 namespace，不是可写 config 条目”；activation 行不再打印该列表。
- #92 / #88 / #91 / #81 / #83 / #80 / #76 等仍按原状态等待实机或日志；PR 队列已清空（除已合并/关闭项）。

## 2026-10-27 修复（0.1.21）

- [#94 macOS 跨显示器拖动](https://github.com/QCYTSN/dsh-dafeiyu/issues/94)：合并 [#96](https://github.com/QCYTSN/dsh-dafeiyu/pull/96)。`PetPanel` 覆写 `constrainFrameRect`，拖动期间使用 `moveToActiveSpace + fullScreenAuxiliary`，松手恢复 `canJoinAllSpaces / stationary`；`keepFront` 拖动期间不再重设 collectionBehavior。PR 四组 CI 全绿后合并，作者已在本机双向跨屏验证；普通桌面与全屏 Space 的跨屏行为仍待更多实机反馈。
- [#95 右键菜单设置重启回退](https://github.com/QCYTSN/dsh-dafeiyu/issues/95)：新增 host 侧兜底 `$DSH_HOME/dsh-dafeiyu/user-settings.json`。`settings.update` 失败时记录菜单值与 host 基线；Helper / DSH 重启后只要 host 仍是旧值就沿用菜单选择，host 侧之后改变则自动清除兜底。重放的 CONFIG 与下一次 Helper spawn 的环境同步使用生效值。失败原因、请求的 namespace 和 host 实际暴露的 namespace 写入 Helper 诊断日志。**根因（DSH 拒绝写入的具体环节）尚未定位**，issue 保持打开等报告者的 0.1.21 日志。
- 本地用 DSH 0.2.1-rc.3 + 临时 `DSH_HOME` 的 web profile 复测了 `PATCH /plugins/dsh-dafeiyu/config`：Windows 上写入成功并更新 `cordis.patch.yml`，说明该 host 版本的 settings 服务本身可写；macOS 侧的失败仍需日志确认。

## 2026-10-27 修复（0.1.20）

- [#92 macOS 透明区吞点击](https://github.com/QCYTSN/dsh-dafeiyu/issues/92)：`PetController` 现在用 30 Hz 指针采样切换 `panel.ignoresMouseEvents`，角色与气泡以外区域把点击交给下层应用；拖动、右键菜单和鼠标按下期间保持可交互。气泡 `hidden` 时 `windowSize()` 收窄到角色尺寸（不再恒定预留 420pt 卡片）。命中判定抽到 `PetGeometry.isInteractive` 并有 Swift 单测。**未在 macOS 实机验证穿透效果**，需要 #92 报告者复测。
- [#90 Linux Helper CI runner](https://github.com/QCYTSN/dsh-dafeiyu/pull/90)：已合并（merge commit 177e17a）。保留 glibc 2.35 基线，改在 ubuntu-24.04 + ubuntu:22.04 容器构建；四组 CI 通过。仅构建基础设施，不改随包 Helper。
- [#93 提示音独立开关](https://github.com/QCYTSN/dsh-dafeiyu/pull/93)：CI 已批准并通过。已提交 changes requested：审批系统通知不能只受声音开关控制、默认值会改变升级行为、CHANGELOG 需正式版本段、README_EN 未同步。暂不合并，等作者修订或由维护者整合。
- #88 / #91 仍等报告者用 0.1.19+ 复测；#81 / #83 等 macOS 实机确认；#80 / #76 / #85 保持原有处理方式。

## 2026-10-26 修复（0.1.19）

- [#88 Windows 冷启动无角色](https://github.com/QCYTSN/dsh-dafeiyu/issues/88)：首次就绪等待由 60 秒放宽到 180 秒（重试 90 秒，已就绪过的重启 60 秒）；Helper 生命周期写入 `%LOCALAPPDATA%\dsh-dafeiyu\logs\helper.log`（macOS / Linux 路径见 README），包含启动命令、就绪耗时、超时、退出码、stderr、重试次数与最终放弃原因。PyInstaller 解压临时目录改到插件缓存（Windows `%LOCALAPPDATA%\dsh-dafeiyu\tmp`、Linux `~/.cache/dsh-dafeiyu/tmp`），超过一天的 `_MEI*` 目录在下次启动时清理，不再每次失败留约 100 MB 在系统临时目录。没有改 PyInstaller onedir 形态。
- [#91 Linux arm64 无角色](https://github.com/QCYTSN/dsh-dafeiyu/issues/91)：按 `process.arch` 选择随包 Helper，arm64 不再执行 x86-64 二进制（`ENOEXEC` 会被 `/bin/sh` 解释成语法错误）；缺少 `linux-arm64` Helper 时回退 `python3 runtime/helper.py`，日志写明架构与缺失的 PySide6。`scripts/build-helper.sh` 支持在 aarch64 主机产出 `runtime/bin/linux-arm64`。本轮未新增 arm64 CI / 发布任务，因此 npm 包仍只带 x64 Helper。
- 既有结论不变：[#87](https://github.com/QCYTSN/dsh-dafeiyu/issues/87) 的位置偏移与桌面端唤起已在 0.1.18 修复，双击打开客户端仍按设计保留为摸头；[#81](https://github.com/QCYTSN/dsh-dafeiyu/issues/81)、[#83](https://github.com/QCYTSN/dsh-dafeiyu/issues/83)、[#75](https://github.com/QCYTSN/dsh-dafeiyu/pull/75) 的修复已在 0.1.15 进入主线。以上均待报告者用新版本复验。

## 2026-10-10 修复

- [#87](https://github.com/QCYTSN/dsh-dafeiyu/issues/87) 与 [#78 的重启后打不开反馈](https://github.com/QCYTSN/dsh-dafeiyu/issues/78#issuecomment-6094058849)：官方 Desktop 的 Host 设置 `ELECTRON_RUN_AS_NODE=1`，Helper 继承后又将该变量传给通过 `dsh://open` 启动的应用。0.1.18 在 Helper 启动边界清除它；本地已有的 Windows Desktop 0.2.0-rc.2 已复现清除前无界面、清除后正常唤起。
- #87 位置偏移：已复现气泡高度变化改写角色纵坐标，以及提醒抖动结束后把窗口恢复到尺寸变化前的旧坐标。0.1.18 固定角色锚点、顶部气泡改放下方，并移除 Qt / macOS 的提醒窗口抖动。保留原素材及动作时长。
- 双击打开客户端属于独立交互建议，本次保留双击摸头，先修复现有打开动作和位置问题。没有自动关闭贡献者 issue 或合并其 PR。

## 2026-10-09 整理

- 当前稳定版安装说明已统一到 0.1.17，素材与动画行为沿用 0.1.16。
- #74 的 24 fps 来源说明已完整纳入主分支，其旧文档分支已由现有说明取代。
- #75 中早期的第 36 帧起播与固定停顿方案已被 0.1.16 的完整悬空／落地段替代；当前规则以[动作说明](animation-behavior.md)为准。
- 已完成的仓库开发分支会移除。其余贡献者 PR 保留供继续审查，不作为安装或下载入口。

## 2026-10-06 历史审查

核查日期：2026-10-06。基线为 GitHub `main` 的 `9c0588c`（npm 0.1.14），与本地主仓库一致。角色素材已通过 #67 引入 `PC2005-cloud/dsh-pet`，#72 恢复原生 24 fps；本轮没有替换素材。

本轮主要修复已通过 [#86](https://github.com/QCYTSN/dsh-dafeiyu/pull/86) 合入 `main`（`4ada3b5`），随 0.1.15 发布。随后在现有 Windows 官方桌面端 0.2.0-rc.2 实测，补齐插件详情页设置入口和账户余额小数格式兼容。原有 issue / PR 没有被自动关闭或合并。

## 收到的 5 个 PR

| PR | 审查结论 | 本轮处理与验收条件 |
| --- | --- | --- |
| [#74 素材帧率说明](https://github.com/QCYTSN/dsh-dafeiyu/pull/74) | 内容正确，可解决 | 中英文 README 与 ASSET_LICENSE 改为原生 24 fps；主 README 同时重写。发布文档后可关闭重复 PR。 |
| [#75 拖拽与释放动画](https://github.com/QCYTSN/dsh-dafeiyu/pull/75) | 可采纳 | 已纳入 Python / Swift 动画修改及测试：拖拽保持循环、从第 36 帧进入；释放动作时长对应当前 24 fps 素材。三平台 CI 已通过，纳入 0.1.15。感谢 SamuelIiu。 |
| [#79 鼠标穿透、悬停气泡、设置兼容](https://github.com/QCYTSN/dsh-dafeiyu/pull/79) | 范围较大，建议拆分 | 本轮独立修复了新设置 slot、DSH 0.2 配置和漏打包的 asset_paths.py。未纳入整套鼠标穿透／悬停行为。其根 Config volatile 标记会把整个对象变成引用，且设置 namespace 的猜测存在误认风险；当前实现逐字段标记，并使用 Loader 条目 ID。穿透部分还需验证热键、退出清理及平台差异。感谢 ZzuMrW 提供线索。 |
| [#82 macOS 小气泡字号](https://github.com/QCYTSN/dsh-dafeiyu/pull/82) | 可采纳 | 已纳入保持基本字号的修改，同时将相同原则用于 Qt。macOS CI 已通过，仍需实机观察字号效果。感谢 bosprimigenious。 |
| [#84 macOS 允许部分移出屏幕](https://github.com/QCYTSN/dsh-dafeiyu/pull/84) | 方向正确，边界计算需要调整 | 原 PR 使用整个窗口的宽度计算保留区域，宽气泡可能仍在屏幕内而角色完全消失。当前按角色自身尺寸限制，每个方向至少保留 35%，新增几何测试；需 macOS 实机验证多屏拖动和恢复。感谢 bosprimigenious。 |

## 仍开放的 11 个 issue

| Issue | 可以怎样处理 | 当前状态 |
| --- | --- | --- |
| [#77 DSH 0.2 新插件管理](https://github.com/QCYTSN/dsh-dafeiyu/issues/77) | 适配当前设置页和配置 API | 已实现 plugins.bundle.config、settings.plugins.tab、逐字段 volatile、精确 namespace、实时修改及持久化接口；兼容旧注册 API。官方 Windows 桌面端插件详情页设置与保存已实测。 |
| [#78 打开官方桌面端](https://github.com/QCYTSN/dsh-dafeiyu/issues/78) | 共用实现，自动识别客户端 | 已实现自动／手动打开目标，官方桌面端使用 dsh://open；原生角色右键菜单在实机中已成功唤起现有桌面应用。文档补充应用内安装、desktop profile 与自带 CLI。 |
| [#73 npx 启动说明](https://github.com/QCYTSN/dsh-dafeiyu/issues/73) | 文档修复 | 中英文 README 与更新说明已补齐安装、启动和更新命令。发布文档后可关闭。 |
| [#81 macOS 小气泡字体](https://github.com/QCYTSN/dsh-dafeiyu/issues/81) | 采纳 #82 | 修复纳入 0.1.15，待 macOS 实机验证视觉效果。 |
| [#83 macOS 拖动到屏幕边缘](https://github.com/QCYTSN/dsh-dafeiyu/issues/83) | 调整 #84 的几何规则 | 0.1.15 允许角色部分移出且仍能抓回，待 macOS 实机验证多屏行为。 |
| [#76 升级后大小恢复默认](https://github.com/QCYTSN/dsh-dafeiyu/issues/76) | 恢复用户旧配置，保证今后保存有效 | 报告显示旧 settings.yaml 的大肥鱼段落没有进入新 profile patch。新设置保存已修复；历史值不会自动恢复。[恢复步骤](UPDATING.md#dsh-迁移后角色大小恢复默认76)已写明，不能据此宣称上游迁移已修好。 |
| [#66 Windows EPERM 安装失败](https://github.com/QCYTSN/dsh-dafeiyu/issues/66) | 用已发布的缓存 Helper 修复复验 | main 已通过 #68 在缓存目录运行 Windows Helper，减少包目录锁占用。升级并完全退出后可复验；若再次失败，需要新的被锁定路径与日志。 |
| [#39 缺失依赖及 WSL2 卡死](https://github.com/QCYTSN/dsh-dafeiyu/issues/39) | 分别验证启动依赖与系统性能 | main 已有依赖捆绑、入口失败隔离、消息队列限制和缓存；本轮补齐 Python 源码运行所需 asset_paths.py。WSL2 卡死仍需原环境的 CPU／内存及完整日志，不能仅凭启动测试关闭整个 issue。 |
| [#80 官方桌面端安装失败](https://github.com/QCYTSN/dsh-dafeiyu/issues/80) | 取得完整安装日志后定位 | 官方 Windows 0.2.0-rc.2 的应用内安装已实测成功，并补充操作步骤。原报告只有 exit 1，仍需 hub.log、系统信息及实际安装方式，不能据单机成功关闭原问题。 |
| [#22 高 DPI、高清素材、60 FPS](https://github.com/QCYTSN/dsh-dafeiyu/issues/22) | 已完成部分需求，剩余需独立验收 | 已有平滑插值和当前 412 × 344、24 fps 素材。不能把更频繁的重绘声明为 60 fps 源动画，也不能据此声称所有 4K 场景已解决。 |
| [#85 多任务卡片点击跳转](https://github.com/QCYTSN/dsh-dafeiyu/issues/85) | 技术上可实现，适合下一项功能 | 浏览器公开 uiWorkspace.open(sessionId) 可打开指定会话；原生 Helper 需增加点击反馈并转交客户端。还要处理点击与拖动、已结束会话及客户端焦点。本轮未实现。 |

## 本轮验证范围

- JavaScript 测试涵盖余额解析、来源切换、凭据删除、超时、共享缓存、跨站限制和客户端识别。
- Python 动画测试覆盖 #75，Windows 原生窗口已显示演示余额。构建后的 Helper 通过图形显示与 stdin EOF 退出检查；构建路径已隔离，避免从外部图片工具误收集旧 UCRT DLL。
- 浏览器真实渲染检查通过初始余额、来源切换、实时过期结果和关闭显示；使用受控 Host 响应。
- 使用已发布 DSH 0.2.0-rc.2 的真实 Cordis Loader 与 SettingsForms 验证自定义条目 ID、实时更新、保存后重新加载；文件写入由隔离测试适配器承接。
- API Key 和账户服务均有受控响应测试；随后在官方 Windows 桌面端通过 DSH 账户服务查询实机余额，与其内置账户页核对一致，没有读取或输出登录凭据。
- [三平台 CI](https://github.com/QCYTSN/dsh-dafeiyu/actions/runs/37465829356)已通过：104 项 JavaScript、42 项 Python、36 项 Swift 测试；Linux 与 macOS Helper 构建、打包后图形启动和 stdin EOF 退出均通过。macOS 包含 arm64 / x86_64 架构与签名检查。
- 官方 Windows 桌面端已实测应用内安装、插件详情设置、实时开关、重启保存、余额和原生菜单打开目标；本地 JavaScript 回归测试增至 105 项。macOS 多屏拖动与字号效果仍需实机复验。

建议用户安装当前稳定版后复验 #77、#78；#81、#83 仍待 macOS 实机结果，#73 为文档项。#80、#39 和 #22 保留开放，直到收到对应证据或补齐验收。
