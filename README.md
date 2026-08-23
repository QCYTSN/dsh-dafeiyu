# dsh-dafeiyu 拖拽动画增强

为 DeepSeek Harness 桌面宠物 [QCYTSN/dsh-dafeiyu](https://github.com/QCYTSN/dsh-dafeiyu)（大肥鱼）
重做的**拖拽动画**：全新四帧素材 + 按邮件要求的最小行为接线。

## 分支结构

| 分支 | 内容 | 用途 |
|------|------|------|
| `main` | 官方 v0.1.5 原样 | 干净基线 |
| `feat/pet-actions` | **纯素材 PR 内容**：4 帧 + manifest + 许可证 + 测试，零运行时改动 | 发往上游 |
| `feat/drag-behavior` | 素材之上叠加拖拽阶段接线（本分支） | 另行评估 |

上游要求（PR #23 关评）：只提交素材、`pet-manifest.json`、`ASSET_LICENSE.md`
与必要测试；运行时行为改动单独评估。

## 拖拽素材（assets/pet/dragging/）

画布统一 238×260、底对齐居中，角色高度与原模型一致：

| 文件 | 姿势 | 角色高 | manifest clip |
|------|------|--------|---------------|
| `dragging_238_01.png` | 被持稳定帧 | 243 | `dragging`（按住期间显示） |
| `dragging_238_02.png` | 松手弹开 | 243 | `dragging_release` |
| `dragging_238_03.png` | 晕乎乎 | 243 | `dragging_dizzy` |
| `dragging_238_04.png` | 抗议 | 219（刻意缩小一圈） | `dragging_protest` |

来源：`@Serendipity-wu02` AI 辅助原创，等比缩放处理，声明见 `ASSET_LICENSE.md`。

## 行为接线（runtime/helper.py + animation_model.py）

拖拽流程：

1. **抓起** → 直接显示稳定持帧（无过渡帧）
2. **按住 / 移动** → 全程保持持帧
3. **松手** → 弹开 **300ms** → 晕乎乎 **840ms** → 抗议 **300ms** → 回到底层状态
4. 松手动画期间再次抓起会立即中断；开启"减弱动态效果"时自动跳过整段演出

实现要点：

- 复用现有 overlay 机制播放阶段 clip，**不修改**状态机与自动换帧逻辑
- 单帧 clip 不参与帧推进，由单发定时器驱动切换；令牌机制防止过期回调
- `animation_model.py` 仅将 dragging 系列 clip 加入原子切换集合（防闪烁）
- manifest 缺少阶段 clip 时（旧版素材）安静回退官方原始行为
- 回归测试：Python unittest 19 项、assets 5 项全通过

## 本地验证

```powershell
npm pack --pack-destination <目录>        # 打包当前分支
# 安装到独立 profile 后：
node "<dsh>/lib/bin.js" --profile <name> --port 3090 --no-open
```

或直接跑测试：

```powershell
node --test test/assets.test.js
node scripts/run-python.mjs -m unittest discover -s runtime/tests -t .
```

## 许可

素材与代码许可见 `ASSET_LICENSE.md` 与 `LICENSE`。非官方粉丝作品，
与 DeepSeek 无隶属关系。
