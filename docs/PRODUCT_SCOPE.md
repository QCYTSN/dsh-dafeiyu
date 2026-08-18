# 插件版产品取舍与参考吸收

## 一句话边界

大肥鱼是 DSH 的桌面状态伴侣，不是第二套聊天工具、系统监控器或独立桌宠平台。

## 从独立版保留

独立版现有动作清单包含 `IDLE`、`BLINK`、`GLANCE`、`THINKING`、`WALKING`、
`HAPPY`、`HEAD_PAT`、`TALKING`、`ANGRY`、`POKE_REACT`、`TAIL_REACT`、
`EATING`、`SWEEPING`、`SLEEPING`、`DRAGGING`、`FALLING`、`LANDING`、`DIZZY`。
插件版不把 18 个动作平均保留，而按角色职责筛选：

| 方向 | 保留内容 | 插件版用途 |
| --- | --- | --- |
| 生命感 | 呼吸、眨眼、观察、动作 enter/body/exit | 避免状态图标化、僵硬化 |
| Agent 状态 | 思考、扫地/走路、开心、生气/眩晕 | 映射 thinking、tool、success、error |
| 轻互动 | 摸头、戳、尾巴、拖动 | 保留角色感，但不能盖过 Agent 状态太久 |
| 可用性 | 尺寸、位置、减少动态、始终置顶 | 作为 DSH 插件设置，不建立第二套设置中心 |
| 可靠性 | 动作优先级、可中断、回落状态、原子配置 | 防止动画播完后错误回到 IDLE |

## 从独立版删除或延后

- 不加入第二套 DeepSeek API 对话，不保存 API Key，不维护聊天历史。
- 不加入天气、CPU/内存/GPU 监控；这些状态和 DSH 任务无关。
- 不加入开始菜单入口、独立启动器、独立自动更新、独立登录或云端 Dashboard。
- 首版不加入窗口顶部落脚、复杂抛掷物理、关系等级、饥饿/体力养成和 470 条完整语料。
- 首版不读取前台应用、窗口标题、网页内容或屏幕画面。
- 不让 Agent 为了控制宠物额外调用 MCP、HTTP 或 shell；状态直接来自 DSH 会话总线。

## 从上游大肥鱼最近更新吸收

本地独立版导入上游基线为 `2822f8f`；2026-08-14 查询到上游 `main` 为
`5b0e018`，两者之间有 9 个提交、16 个文件变化：

- 吸收：Qt UI 更新必须回到主线程；敏感配置不入库；右键菜单与真实状态同步；
  朝向和拖动方向需要有回归测试。
- 不吸收：内置 DeepSeek 对话、天气查询、系统资源告警、API Key 配置。
- 有选择吸收：单击与双击判定、穿透后可恢复、配置恢复，但入口必须归 DSH。

对比记录：
https://github.com/1190fasheqi/dafeiyu-pet/compare/2822f8f215e34f3177c00b1fb6c0d073eefdea31...5b0e01856116bd2bae82df1f43c32faa5f056196

## 从 Codex Pets 与同类项目吸收

### Codex Pets

- 状态应持续循环到下一次真实状态变化，不能播一次就自行回到 idle。
- 多任务默认自动跟随最值得提醒的任务，同时允许未来手动固定某个 Session。
- 建议优先级：需要输入 > 阻塞/失败 > 已完成待查看 > 工作中 > 空闲。
- 气泡要能解释“当前状态由哪个任务/事件造成”，而不只显示一个动作。
- 设置入口放在 DSH；宠物右键只保留显示、隐藏、位置和快捷状态信息。

参考：https://github.com/openai/codex/issues/32994

### OpenPet / CoPet

- 吸收：事件归一化协议、状态气泡、减少动态、尺寸与位置、资产包验证、未知事件安全忽略。
- 吸收：输入资产按不可信数据处理；插件包与角色美术许可证分开。
- 不吸收：本地 HTTP 服务、固定端口、MCP 控制层、多 Agent 通用 Hook 安装器、宠物商店。
- 不吸收：独立托盘设置中心；DSH 已经是唯一宿主和入口。

参考：

- https://github.com/X-T-E-R/OpenPet
- https://github.com/ChanceYu/CoPet

## 插件版动作白名单（Phase 1）

| DSH 状态 | 主动作 | 可穿插微动作 | 离开条件 |
| --- | --- | --- | --- |
| `IDLE` | 呼吸 | 眨眼、观察、短距离走动 | 新 Session 状态 |
| `THINKING` | 思考 | 观察、轻晃 | tool/call 或 turn/end |
| `WORKING` | 扫地/走路/工具分类动作 | 不插入纯娱乐动作 | tool/result 或 turn/end |
| `WAITING` | 等待/说话 | 低频提示 | 用户输入后新事件 |
| `SUCCESS` | 开心 | 无 | 短脉冲后回到聚合后的真实状态 |
| `ERROR` | 生气或眩晕 | 无 | 短脉冲后回到聚合后的真实状态 |

交互动作 `HEAD_PAT`、`POKE_REACT`、`TAIL_REACT` 只能短暂覆盖画面，结束后必须
回到最新 DSH 状态，而不是无条件回到 `IDLE`。

## 实施顺序

1. Phase 0：真实 DSH 事件桥、无端口 IPC、Helper 生命周期、诊断渲染器。
2. Phase 1：迁移动作白名单与渲染状态机，加入持久状态循环、微动作层和减少动态。
3. Phase 2：DSH 内插件设置页、启用/禁用、尺寸/位置、多 Session 自动选择与手动固定。
4. Phase 3：Windows / Linux 预构建 Helper、安装/升级/回滚、崩溃恢复与签名发布。
