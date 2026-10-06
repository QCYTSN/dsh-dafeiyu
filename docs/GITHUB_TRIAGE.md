# GitHub issue / PR 处理清单

核查日期：2026-10-06。基线为 GitHub `main` 的 `9c0588c`（npm 0.1.14），与本地主仓库一致。角色素材已通过 #67 引入 `PC2005-cloud/dsh-pet`，#72 恢复原生 24 fps；本轮没有替换素材。

以下“本轮修复”指当前分支的 Unreleased 改动，尚未发布。原有 issue / PR 没有被自动关闭或合并。

## 收到的 5 个 PR

| PR | 审查结论 | 本轮处理与验收条件 |
| --- | --- | --- |
| [#74 素材帧率说明](https://github.com/QCYTSN/dsh-dafeiyu/pull/74) | 内容正确，可解决 | 中英文 README 与 ASSET_LICENSE 改为原生 24 fps；主 README 同时重写。发布文档后可关闭重复 PR。 |
| [#75 拖拽与释放动画](https://github.com/QCYTSN/dsh-dafeiyu/pull/75) | 可采纳 | 已纳入 Python / Swift 动画修改及测试：拖拽保持循环、从第 36 帧进入；释放动作时长对应当前 24 fps 素材。三平台 CI 已通过，待发布。感谢 SamuelIiu。 |
| [#79 鼠标穿透、悬停气泡、设置兼容](https://github.com/QCYTSN/dsh-dafeiyu/pull/79) | 范围较大，建议拆分 | 本轮独立修复了新设置 slot、DSH 0.2 配置和漏打包的 asset_paths.py。未纳入整套鼠标穿透／悬停行为。其根 Config volatile 标记会把整个对象变成引用，且设置 namespace 的猜测存在误认风险；当前实现逐字段标记，并使用 Loader 条目 ID。穿透部分还需验证热键、退出清理及平台差异。感谢 ZzuMrW 提供线索。 |
| [#82 macOS 小气泡字号](https://github.com/QCYTSN/dsh-dafeiyu/pull/82) | 可采纳 | 已纳入保持基本字号的修改，同时将相同原则用于 Qt。macOS CI 已通过，仍需实机观察字号效果。感谢 bosprimigenious。 |
| [#84 macOS 允许部分移出屏幕](https://github.com/QCYTSN/dsh-dafeiyu/pull/84) | 方向正确，边界计算需要调整 | 原 PR 使用整个窗口的宽度计算保留区域，宽气泡可能仍在屏幕内而角色完全消失。当前按角色自身尺寸限制，每个方向至少保留 35%，新增几何测试；需 macOS 实机验证多屏拖动和恢复。感谢 bosprimigenious。 |

## 仍开放的 11 个 issue

| Issue | 可以怎样处理 | 当前状态 |
| --- | --- | --- |
| [#77 DSH 0.2 新插件管理](https://github.com/QCYTSN/dsh-dafeiyu/issues/77) | 适配当前设置页和配置 API | 本轮已实现新 settings.plugins.tab、逐字段 volatile、精确 namespace、实时修改及持久化接口；兼容旧注册 API。发布后验证用户环境。 |
| [#78 打开官方桌面端](https://github.com/QCYTSN/dsh-dafeiyu/issues/78) | 共用实现，自动识别客户端 | 本轮已实现自动／手动打开目标，官方桌面端使用 dsh://open。无需维护两个功能分叉；文档补充 desktop profile 与自带 CLI 的安装方式。 |
| [#73 npx 启动说明](https://github.com/QCYTSN/dsh-dafeiyu/issues/73) | 文档修复 | 中英文 README 与更新说明已补齐安装、启动和更新命令。发布文档后可关闭。 |
| [#81 macOS 小气泡字体](https://github.com/QCYTSN/dsh-dafeiyu/issues/81) | 采纳 #82 | 本轮已实现，待 macOS 验证和发布。 |
| [#83 macOS 拖动到屏幕边缘](https://github.com/QCYTSN/dsh-dafeiyu/issues/83) | 调整 #84 的几何规则 | 本轮已实现角色可部分移出且仍能抓回，待 macOS 验证和发布。 |
| [#76 升级后大小恢复默认](https://github.com/QCYTSN/dsh-dafeiyu/issues/76) | 恢复用户旧配置，保证今后保存有效 | 报告显示旧 settings.yaml 的大肥鱼段落没有进入新 profile patch。新设置保存已修复；历史值不会自动恢复。[恢复步骤](UPDATING.md#dsh-迁移后角色大小恢复默认76)已写明，不能据此宣称上游迁移已修好。 |
| [#66 Windows EPERM 安装失败](https://github.com/QCYTSN/dsh-dafeiyu/issues/66) | 用已发布的缓存 Helper 修复复验 | main 已通过 #68 在缓存目录运行 Windows Helper，减少包目录锁占用。升级并完全退出后可复验；若再次失败，需要新的被锁定路径与日志。 |
| [#39 缺失依赖及 WSL2 卡死](https://github.com/QCYTSN/dsh-dafeiyu/issues/39) | 分别验证启动依赖与系统性能 | main 已有依赖捆绑、入口失败隔离、消息队列限制和缓存；本轮补齐 Python 源码运行所需 asset_paths.py。WSL2 卡死仍需原环境的 CPU／内存及完整日志，不能仅凭启动测试关闭整个 issue。 |
| [#80 官方桌面端安装失败](https://github.com/QCYTSN/dsh-dafeiyu/issues/80) | 取得完整安装日志后定位 | 已补充正确安装归属。报告只有 exit 1，无法证明是依赖、文件锁、包管理器或网络问题；需 hub.log、系统信息及实际安装方式。 |
| [#22 高 DPI、高清素材、60 FPS](https://github.com/QCYTSN/dsh-dafeiyu/issues/22) | 已完成部分需求，剩余需独立验收 | 已有平滑插值和当前 412 × 344、24 fps 素材。不能把更频繁的重绘声明为 60 fps 源动画，也不能据此声称所有 4K 场景已解决。 |
| [#85 多任务卡片点击跳转](https://github.com/QCYTSN/dsh-dafeiyu/issues/85) | 技术上可实现，适合下一项功能 | 浏览器公开 uiWorkspace.open(sessionId) 可打开指定会话；原生 Helper 需增加点击反馈并转交客户端。还要处理点击与拖动、已结束会话及客户端焦点。本轮未实现。 |

## 本轮验证范围

- JavaScript 测试涵盖余额解析、来源切换、凭据删除、超时、共享缓存、跨站限制和客户端识别。
- Python 动画测试覆盖 #75，Windows 原生窗口已显示演示余额。构建后的 Helper 通过图形显示与 stdin EOF 退出检查；构建路径已隔离，避免从外部图片工具误收集旧 UCRT DLL。
- 浏览器真实渲染检查通过初始余额、来源切换、实时过期结果和关闭显示；使用受控 Host 响应。
- 使用已发布 DSH 0.2.0-rc.2 的真实 Cordis Loader 与 SettingsForms 验证自定义条目 ID、实时更新、保存后重新加载；文件写入由隔离测试适配器承接。
- 未使用用户的真实凭据查询余额；API Key 和账户服务分别使用受控响应测试。
- [三平台 CI](https://github.com/QCYTSN/dsh-dafeiyu/actions/runs/37465829356)已通过：104 项 JavaScript、42 项 Python、36 项 Swift 测试；Linux 与 macOS Helper 构建、打包后图形启动和 stdin EOF 退出均通过。macOS 包含 arm64 / x86_64 架构与签名检查。
- 官方桌面应用完整端到端操作、macOS 多屏拖动和字号效果仍需实机复验，不能等同于隔离服务测试或 CI 启动检查。

建议发布后优先复验 #77、#78、#81、#83；#73 为文档项。#80、#39 和 #22 保留开放，直到收到对应证据或补齐验收。
