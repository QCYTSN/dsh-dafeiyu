# dsh-dafeiyu macOS 原生助手

> **AI 辅助生成**：本目录的 Swift 源码与构建产物由 AI 辅助生成，经人工
> review 与调试后合入（详见主 README 的「macOS 原生适配」章节）。

这是 `dsh-dafeiyu` 桌面大肥鱼的 **macOS 原生实现**：用 Swift + 纯
AppKit 重写了原来的 Qt/PySide6 helper 和 PyObjC 原生窗口原型，不依赖
Python、Qt 或 PyObjC，因此彻底绕开了「anaconda Python 3.13 + PySide6 /
PyObjC 在 macOS 26 上崩溃 → EPIPE 未捕获 → 整个 dsh 服务器退出」的故障链。

## 重做了哪些地方

- Qt/PySide6 可视窗口 → Swift + AppKit（NSPanel 原生实现）
- PyObjC 原生窗口原型 → Swift 实现（同一套 NSPanel 方案）
- 全屏置顶：`canJoinAllSpaces` + `fullScreenAuxiliary` + `.floating` 层级，
  每 2 秒重新断言，全屏 App 下保持前端
- 权限：`UNUserNotificationCenter` 通知授权 + `AXIsProcessTrustedWithOptions`
  辅助功能检查/请求
- EPIPE 兜底：helper 崩溃不拖垮 dsh 服务器
- 渲染/交互修复：flipped 视图图片倒置、拖拽 1:1 跟手、拖拽时人物与气泡同步
- 布局迁移：旧 Qt top-left 坐标 → AppKit bottom-left，文件路径不变

## 兼容性

- Universal binary：Apple Silicon（arm64）+ Intel（x86_64）
- 最低系统：macOS 12.0（`build.sh` 以 `-target *-apple-macosx12.0` 构建）
- 构建工具：Xcode Command Line Tools（`swiftc` + `lipo` + `codesign`）

## 功能（与 Windows/Qt 版对齐）

- 状态展示：`IDLE / THINKING / WORKING / WAITING / SUCCESS / ERROR /
  DISCONNECTED`，状态卡 + 多任务卡（颜色、图标、截断文本）
- 动画内核：`runtime/animation_model.py` 的忠实移植（clips、pulse、
  overlay、idle 微动作、crossfade、程序化 motion：breathe/think/work/
  wait/bounce/shake/dizzy/float + 行走摆动）
- 交互：左键拖拽（带抓取、松手、眩晕和抗议动画并持久化位置）、单击摸头/戳/尾巴、
  双击、右键菜单（大小/气泡大小/减少动态/打开 WebUI/辅助功能权限/
  本次隐藏/本次关闭）
- 全屏置顶：`NSWindow.CollectionBehavior` 的 `canJoinAllSpaces` +
  `fullScreenAuxiliary` + `stationary`，`NSWindow.Level.floating`，每 2 秒
  重新断言层级并 `orderFrontRegardless()`，全屏 App 下依然在前端
- 布局持久化：`~/.dsh/dsh-dafeiyu/layout.json`（与旧版同路径；首次启动
  自动迁移旧 Qt 版 top-left 坐标到 AppKit bottom-left）
- 权限（苹果官方接口）：UserNotifications 通知授权
  （SUCCESS/ERROR 脉冲时提示，失败则回退到 beep + 窗口抖动）；
  Accessibility 检查/请求（`AXIsProcessTrustedWithOptions` + 系统设置
  深链），可在右键菜单触发
- 协议兼容：与插件 `src/protocol.js` 完全一致（ready/pong/closed +
  state/pulse/task/tasks/config/shutdown），支持 `--headless`
  `--event-log` `--snapshot` 调试参数

## 构建

```bash
native/macos/build.sh
```

产物：`runtime/bin/darwin/dsh-dafeiyu-helper.app`（Universal 二进制
arm64 + x86_64，最低 macOS 12.0，ad-hoc 签名，素材打进
`Contents/Resources/assets`）。要求 Xcode Command Line Tools（`swiftc`）。

## 签名与 Gatekeeper 边界

自动构建会执行 ad-hoc 签名，并用 `codesign --verify --deep --strict` 检查应用包
完整性；这不等同于 Apple Developer ID 签名或公证。0.1.4 实验性发布没有仓库可用的
Developer ID / Notary 凭据，因此浏览器下载并带有隔离属性的包仍可能被 Gatekeeper
拦截。正式签名与公证继续在 #24 跟踪，不能把 ad-hoc 签名描述为正式分发签名。

## 测试（Swift 核心）

状态机（`AnimationModel`）与布局持久化（`PetLayout`）的可重复测试放在
`Tests/`，分别对照 `runtime/tests/test_animation_model.py` 和
`runtime/tests/test_layout_store.py` 的用例，防止 Python 与 Swift 两套实现
静默漂移：

```bash
swift test                  # 仓库根目录（Swift Package Manager）
```

PR 与发布 CI（`.github/workflows/ci.yml` 和
`.github/workflows/publish.yml` 的 macOS job）都会运行 `swift test`。

### 布局持久化测试发现并修复的漂移

- `defaultPath()` 缺失 `XDG_CONFIG_HOME`（及 `LOCALAPPDATA`）回退，与
  Python 的平台路径优先级不一致 → 已补齐，并支持注入环境字典以便测试
- JSON 布尔值会被 Swift 桥接成 `1/0`，导致 `x: true` 被当作坐标、`scale:
  false` 被当作 `0.55` → 已按 Python 语义排除布尔值
- `bubbleStates` 含非法项时 Python 只保留字符串项，Swift 会整组丢弃 →
  已改为同样的过滤行为
- `save()` 前不做归一化（Python 会 clamp scale/bubbleScale、校验
  bubbleMode）→ 已统一走 `normalized()`，保存与读取行为一致

### 事件日志测试按协议语义匹配

JS heartbeat 用例原先按 `"kind": "ping"`（带空格）的字符串匹配事件日志，
与具体 JSON 序列化格式耦合。现改为逐行 `JSON.parse` 后判断 `kind`，
验证的是协议语义而非空白格式，Swift 与 Python helper 均可通过。

## 本机验证记录

**测试机型：MacBook Pro（Apple M3，16 GB，arm64，macOS 26.5.2 / 25F84）**

| 项目 | 结果 |
| --- | --- |
| Swift 核心测试（状态机 + 布局 + 可重复性，`swift test`） | 32/32 通过 |
| Python 测试（animation_model + layout_store + helper_platform） | 20/20 通过 |
| JS 测试套件（`npm test`，含 helper 生命周期/心跳/集成） | 71/71 通过 |
| 打包产物烟测（`test-packaged-helper.mjs`，最终 .app 可视 + EOF） | 通过 |
| 通用二进制校验（`lipo -verify_arch arm64 x86_64`） | 通过 |
| 签名校验（`codesign --verify --deep --strict`） | 通过 |
| 端到端（打开页面→宠物出现→关闭页面→宠物退出，0.1.6 原生 helper） | 通过 |

## 用户安装（macOS 端用户）

> 开发者的核心逻辑测试（状态机 + 布局持久化）见上方「测试（Swift 核心）」
> 章节。

原生 Helper 从 0.1.4 起作为实验性功能随 npm 和 GitHub Release 发布。普通用户
**不需要**自行构建或运行本目录的源码，直接用 DSH 的插件命令安装即可：

```bash
pnpm exec dsh plugin --profile web add dsh-dafeiyu
```

或从 GitHub Releases 下载 `dsh-dafeiyu-<version>.tgz` 后安装：

```bash
pnpm exec dsh plugin --profile web add ~/Downloads/dsh-dafeiyu-<version>.tgz
```

完整安装步骤见主 README 的「macOS 用户」小节。

## 接入

`src/helper-process.js` 在 `process.platform === 'darwin'` 时优先使用该
原生 helper（与 Windows 的 win32-x64 EXE 同路径模式）；helper 崩溃时由
插件自动重启，且 stdin/stdout/stderr 的 EPIPE 已被兜底，不再拖垮 dsh。

重新打包并安装到 dsh profile：

```bash
npm pack          # 生成 dsh-dafeiyu-<version>.tgz
# 把 tarball 路径写入 ~/.dsh/profiles/web/package.json 的 dependencies，
# 并把 dsh-dafeiyu 加回 bundles 列表，然后解包到
# ~/.dsh/profiles/web/node_modules/dsh-dafeiyu
```

## 回退

- 临时停用：dsh WebUI 设置里关闭 dsh-dafeiyu，或右键宠物 → 本次关闭
- 彻底移除：从 `~/.dsh/profiles/web/package.json` 删掉 dsh-dafeiyu 依赖和
  bundle 项，删除 `node_modules/dsh-dafeiyu`，重启 dsh 服务
- 旧版插件如需找回，可从之前安装的 `.tgz` 或 npm 版本恢复
