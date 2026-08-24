# 插件更新与回退

大肥鱼由 DSH 的 `web` profile 管理。Helper 不提供独立更新器，也不要手动替换
随包二进制（Windows 的 `.exe`、Linux 的 `dsh-dafeiyu-helper` 或 macOS 的 `.app`）。

## 从 npm Alpha 更新

1. 完全退出 DSH。
2. 在 DSH 安装目录运行：

```powershell
pnpm dsh plugin --profile web update dsh-dafeiyu@alpha
```

也可以重新执行安装命令：

```powershell
pnpm dsh plugin --profile web add dsh-dafeiyu@alpha
```

## 从 GitHub Release 安装包更新

1. 完全退出 DSH。
2. 从项目的 GitHub Release 下载新的 `dsh-dafeiyu-<version>.tgz`。
3. 在 DSH 安装目录运行：

```powershell
pnpm dsh plugin --profile web add "C:\下载目录\dsh-dafeiyu-<version>.tgz"
```

`add` 会把 `web` profile 中原来的大肥鱼依赖替换为新安装包。重新启动 DSH 后，
插件、设置卡和随包携带的 Helper 会一起更新。用户设置由 DSH 保存，正常
更新不会要求重新配置。

## 回退

保留上一个可用版本的 `.tgz`，完全退出 DSH 后，用同一条 `add` 命令重新安装旧包：

```powershell
pnpm dsh plugin --profile web add "C:\下载目录\dsh-dafeiyu-<old-version>.tgz"
```

## 卸载

```powershell
pnpm dsh plugin --profile web remove dsh-dafeiyu
```

当前 Alpha 包尚未提供自动更新检查，因此 GitHub 仓库出现新提交不会自动改变已经
安装的插件；只有发布新版本并由用户执行 npm 或 Release 包更新后，安装内容才会变化。
