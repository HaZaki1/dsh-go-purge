# dsh-go-purge（手机版适配）

把本机 `dsh-purge@1.1.71` 的核心能力搬到 **dsh-go**（Android 手机版 DeepSeek Harness）的原生插件形态：

- 引擎内提示词接管：`system-prompt/assemble` 幂等改写 + `systemPrompt.section`，人设置顶、剥官方身份行；
- 人设与规则：多套人设、按模型选择、命令 `/purge`、工具 `purge_status` / `purge_use`；
- dsh-go 原生界面：胶囊、状态条、面板、工具卡（`presentationMeta`），App 不执行插件代码；
- **不带过来**：桌面 asar patch、Windows shim、cmd-flash、官方升级器、重启宿主、Web 控制台、审批/hooks-deny 绕过、权限预设钉死。手机上这些会破坏 App 自己的确认流程，也没有对应目标。

## 署名（必读）

原始项目 **YuJunZhiXue/dsh-purge（作者：小杨）**，镜像 **ZXEB/dsh-purge v1.1.71**；作者要求借用名称/思路/代码/提示词必须署名并写明来源。本适配版保留原始默认提示词原文，来源见 [ATTRIBUTION.md](ATTRIBUTION.md)。LICENSE 沿用原项目 MIT。

## 安装（在 dsh-go 的本机 Linux 终端里）

```sh
# 路径是引擎所在机器（手机）上的路径
dsh plugin --profile web add /绝对路径/dsh-go-purge
dsh --profile web --dump-config
```

装好后新开会话，聊天页输入框上方出现「状态 / 切人设」胶囊和一条状态条；对话详情页「插件」页签有破甲控制台。

## 用法

| 入口 | 作用 |
|---|---|
| `/purge status` | 查看生效人设、模式、状态目录、正文长度 |
| `/purge list` | 列出人设 |
| `/purge use <id>` | 切换人设（新会话生效） |
| `/purge mode replace\|append\|off` | 切换注入模式 |
| `/purge reset` | 恢复默认人设与 `replace` |
| 工具 `purge_status` / `purge_use` | 给模型调用，结果带原生卡片 |
| 原生面板 | 点胶囊或状态条打开；可切人设、改模式、复制规则、编辑短人设 |

状态文件都在 `$DSH_HOME/dsh-go-purge/`：

```
dsh-go-purge/
├─ state.json                 # active / mode / byModel / enabled
└─ personas/
   ├─ _index.json
   ├─ little-code-sauce.md    # 原始 dsh-purge 默认提示词（21K）
   └─ <你的人设>.md
```

`byModel` 可按模型选人设；模型名从 session header 或上下文里读，读不到就用全局 `active`。

## 手机端边界

- 不写桌面安装目录，不修改 app.asar，不创建 shim，不重启 App。
- 不自动放行工具审批：dsh-go 的确认由 App 控制，本插件只在提示词层工作。
- 原生人设表单受 App 限制（单字段 ≤ 2000 字）；21K 的默认人设直接用即可，不需要重录。
- 人设会随模型请求发出；不要放密钥或隐私数据。

## 验证

```sh
npm test
node /path/to/dsh-go/sdk/plugin-kit/bin/check.mjs . --load
```

本目录已用 dsh-go 仓库的 `check.mjs --load` 验证：原生插槽 2 胶囊 + 1 状态条 + 2 面板 + 1 对话操作，工具 2 个，视图全部可显示，退出码 0。

移植映射与取舍见 [docs/PORTING.md](docs/PORTING.md)。
