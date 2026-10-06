# 更新、回退与配置恢复

先确认插件安装在 `web` 还是官方桌面端的 `desktop` profile。使用命令操作前完全退出对应 Host，包括托盘或后台仍在运行的进程；操作完成后重新启动。使用应用内插件管理时，按应用提示重启。

余额与 DSH 0.2 插件设置修复从 **0.1.15** 起提供。

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

官方桌面端 0.2.0-rc.2 的安装页面明确说明暂不支持自动更新。打开左侧 **插件**，卸载 **dsh-dafeiyu**，再通过 **添加插件** 安装 `dsh-dafeiyu@0.1.15`，并点击 **立即启用**。若应用提示刷新或重启，按提示操作。

只填包名会选择安装源中的最新版。新版本刚发布时，默认安装源可能仍返回旧版；指定目标版本后核对详情页版本号。以后升级时，将 `0.1.15` 替换为目标版本。

命令方式必须使用**桌面应用自带的 CLI**。先启动一次应用初始化 profile，完全退出，再执行：

```powershell
dsh plugin --profile desktop update dsh-dafeiyu
```

命令入口是安装目录中的 `resources/runtime/cli/bin/dsh`（Windows 为 `dsh.cmd`）；提供命令注册的版本也可从应用菜单注册它。独立 npm / `npx @deepseek-ai/dsh` 的 CLI 不能修改官方 Desktop profile。[上游安装归属说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.zh.md#bundled-command-runtime)。

第三方桌面壳可能仍连接 `web` profile，需按实际 Host 判断。

## 回退或安装离线包

从 [Releases](https://github.com/QCYTSN/dsh-dafeiyu/releases) 下载目标版本 `.tgz`，不解压，用同一 profile 的 `add` 命令替换安装：

```powershell
# WebUI
npx -y @deepseek-ai/dsh plugin --profile web add "C:\Downloads\dsh-dafeiyu-0.1.14.tgz"

# 官方桌面端，自带 CLI
dsh plugin --profile desktop add "C:\Downloads\dsh-dafeiyu-0.1.14.tgz"
```

路径和版本替换为实际文件。升级 DSH 后回退到旧插件，可能重新遇到设置接口兼容问题，请同时核对两者版本。

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

## 更新通知

在 GitHub 仓库选择 **Watch → Custom → Releases**，或订阅 [Release feed](https://github.com/QCYTSN/dsh-dafeiyu/releases.atom)。Star 只收藏项目。
