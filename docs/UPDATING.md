# 更新、回退与配置恢复

先确认插件安装在 `web` 还是官方桌面端的 `desktop` profile。使用命令操作前完全退出对应 Host，包括托盘或后台仍在运行的进程；操作完成后重新启动。使用应用内插件管理时，按应用提示重启。

**当前稳定版为 0.1.23。** 推荐安装 `dsh-dafeiyu@0.1.23`，下载入口固定为[最新版发布页](https://github.com/QCYTSN/dsh-dafeiyu/releases/latest)。当前版本修复 Linux arm64 / 无随架构 Helper 时 Python 回退未给出 PySide6 安装指引的问题；继续包含 0.1.22 的审批提示音与场景开关、0.1.21 的跨显示器拖动与菜单设置兜底、0.1.20 的透明区域点击穿透，以及 0.1.19 的 Helper 冷启动诊断、临时目录清理与 Linux arm64 回退。

## WebUI

全局 CLI：

```powershell
dsh plugin --profile web update dsh-dafeiyu
```

`npx` 用户：

```powershell
npx -y @deepseek-ai/dsh plugin --profile web update dsh-dafeiyu
```

从 DeepSeek Harness 源码启动的用户，在 Harness 仓库中执行 `pnpm dsh plugin --profile web update dsh-dafeiyu`。

## 官方桌面端

官方桌面端 0.2.0-rc.2 的安装页面明确说明暂不支持自动更新。打开左侧 **插件**，卸载 **dsh-dafeiyu**，再通过 **添加插件** 安装 `dsh-dafeiyu@0.1.23`，并点击 **立即启用**。若应用提示刷新或重启，按提示操作。

只填包名会选择安装源中的最新版。新版本刚发布时，默认安装源可能仍返回旧版；使用本页的明确版本号，并在安装后核对详情页。以后升级时以[最新版发布页](https://github.com/QCYTSN/dsh-dafeiyu/releases/latest)为准。

命令方式必须使用**桌面应用自带的 CLI**。先启动一次应用初始化 profile，完全退出，再执行：

```powershell
dsh plugin --profile desktop update dsh-dafeiyu
```

命令入口是安装目录中的 `resources/runtime/cli/bin/dsh`（Windows 为 `dsh.cmd`）；提供命令注册的版本也可从应用菜单注册它。独立 npm / `npx @deepseek-ai/dsh` 的 CLI 不能修改官方 Desktop profile。[上游安装归属说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.zh.md#bundled-command-runtime)。

第三方桌面壳可能仍连接 `web` profile，需按实际 Host 判断。

## 安装当前离线包

从[最新版发布页](https://github.com/QCYTSN/dsh-dafeiyu/releases/latest)的 **Assets** 下载 **`dsh-dafeiyu-0.1.23.tgz`**。这是 Windows、Linux 和 macOS 共用的安装包；**Source code (zip / tar.gz)** 仅供源码开发。安装包不用解压，用同一 profile 的 `add` 命令替换安装：

```powershell
# WebUI
npx -y @deepseek-ai/dsh plugin --profile web add "C:\Downloads\dsh-dafeiyu-0.1.23.tgz"

# 官方桌面端，自带 CLI
dsh plugin --profile desktop add "C:\Downloads\dsh-dafeiyu-0.1.23.tgz"
```

路径替换为实际下载位置。桌面应用的 **添加插件** 也接受安装包的完整路径。

## 有意回退（仅排错）

历史发布页保留版本记录，旧安装附件已撤下，避免被当作最新版下载。确需排错回退时，先选定与当前 DSH 兼容的已知版本，再用对应客户端的 `add` 命令安装 npm 上的明确版本。不要使用历史测试记录中的版本号作为一般安装建议；升级 DSH 后回退到旧插件，可能重新遇到设置接口兼容问题。

## 移除

```powershell
# WebUI
npx -y @deepseek-ai/dsh plugin --profile web remove dsh-dafeiyu

# 官方桌面端，自带 CLI
dsh plugin --profile desktop remove dsh-dafeiyu
```

## DSH 迁移后角色大小恢复默认（#76）

该报告中，旧 `settings.yaml` 的大肥鱼配置没有进入新 profile 的 `cordis.patch.yml`。角色启动参数因此得到默认大小；本地位置文件里保留的旧大小不会覆盖 Host 的明确配置。

新的实时设置适配可保存今后的修改，**不会自动找回已经丢失的历史配置**。安装包含修复的版本后，在大肥鱼设置页重新设置并保存原来的角色大小、气泡大小等值，再重启验证。

如果设置页暂时无法使用，可以在退出 Host 并备份用户配置后，将旧值合并到**对应 profile 的用户 patch**。默认位置为 `~/.dsh/profiles/web/cordis.patch.yml` 或 `~/.dsh/profiles/desktop/cordis.patch.yml`；设置了 `DSH_HOME` 时以该目录为准。

```yaml
- id: dsh-dafeiyu
  config:
    scale: 0.6
    bubbleScale: 0.8
    activityLevel: lively
    includeSubagents: true
```

以上仅为示例，请用自己的旧值和实际插件条目 ID。合并到已有同 ID 条目的 `config`；没有对应覆盖条目时再追加。保留文件中其他插件配置，勿用示例覆盖整个文件，也不要修改 npm 包内的默认 `cordis.patch.yml`。若旧文件已被上游迁移重命名，可检查 `settings.yaml.imported` 等备份。

## Windows `EPERM` / `EBUSY`（#66）

当前稳定版已经通过在本地缓存运行 Windows Helper，减少安装目录中可执行文件的锁占用。更新前仍需完全退出相关 Host；如果同时运行 WebUI 和 Desktop，分别确认其后台进程已退出。

如果再次失败，保留包含**实际被锁定路径**的完整安装日志。只看到 `[exit 1]` 不足以区分文件锁、包管理器、网络和兼容性检查问题。不要通过删除整个 DSH profile 排错，以免丢失设置和会话。

## 角色不出现 / Helper 启动失败（#88、#91）

从 0.1.23 起，Helper 的启动过程会写入诊断日志，超时、`exited before ready`、`spawn error` 和最终放弃都会留下原因：

- Windows：`%LOCALAPPDATA%\dsh-dafeiyu\logs\helper.log`
- macOS：`~/Library/Logs/dsh-dafeiyu/helper.log`
- Linux：`${XDG_STATE_HOME:-~/.local/state}/dsh-dafeiyu/helper.log`

首次启动要把约 100 MB 的 Qt 运行库解压到临时目录，杀毒软件实时扫描可能让冷启动超过一分钟；首次就绪等待上限已放宽到 180 秒（重试 90 秒，已就绪过的重启 60 秒）。解压目录在 Windows 为 `%LOCALAPPDATA%\dsh-dafeiyu\tmp`、Linux 为 `~/.cache/dsh-dafeiyu/tmp`，其中超过一天的 `_MEI*` 残留会在下次启动时清理。旧版本遗留在系统临时目录（如 `%TEMP%\_MEI*`）的目录不会自动删除，确认没有 Helper 运行时可以手动清理。

Linux arm64 的 npm 包内没有对应的随架构 Helper，会回退到 `python3 runtime/helper.py`；需要给运行 Host 的 Python 安装 `PySide6>=6.7,<7`（`python3 -m pip install --user "PySide6>=6.7,<7"`）。0.1.23 起，日志和 console 会明确写出 arch 与缺失的 PySide6 安装命令，而不是静默重试后放弃。注意 npm 包仍不带 `linux-arm64` 原生 Helper。

需要改变日志位置时设置 `DSH_DAFEIYU_LOG_FILE=<路径>`，设为 `off` 可关闭。日志只包含本地路径与 Helper 的启动/错误信息，不包含凭据。

## 右键菜单改大小后重启回退（#95）

0.1.23 起，插件会把右键菜单选择的大小、气泡大小和「减少动态」记到 `$DSH_HOME/dsh-dafeiyu/user-settings.json`（默认 `~/.dsh/dsh-dafeiyu/user-settings.json`）。这是 DSH `settings.update()` 写不进去时的兜底：

- 只要 DSH 里仍是选择时的旧值，helper 重启或 DSH 重启后仍沿用菜单选择；
- 之后在 DSH 设置页改成新值时，兜底会自动清除，新值优先；
- 删除这个文件可以放弃兜底、回到 DSH 设置页的值。

同时失败原因会写到 Helper 日志（路径见上一节）。如果 DSH 设置页本身保存失败，设置页仍会报错；请把 Helper 日志里 `settings.update failed` 那一行附到 issue，里面会带请求的 namespace 和 host 实际暴露的 namespace。

## 更新通知

在 GitHub 仓库选择 **Watch → Custom → Releases**，或订阅 [Release feed](https://github.com/QCYTSN/dsh-dafeiyu/releases.atom)。Star 只收藏项目。
