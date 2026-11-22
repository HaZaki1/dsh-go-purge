# dsh-purge → dsh-go 移植映射

| 桌面 dsh-purge | dsh-go 手机版 | 说明 |
|---|---|---|
| `cordis.patch.yml` 改 `system-prompt` 配置 | 保留同样的 `includeHarnessIdentity:false` 等配置 | 两端 DSH 引擎同为 0.2.2-rc.1 系列 |
| `systemPrompt.section` + `installAssembleGuard` + `system-prompt/assemble` | 保留，简化为幂等 `rewriteAssembly` + 单 Symbol guard | `lib/prompt.js` |
| 提示词四重 fallback + 全局 `__dshPurgeHungPrompt` | 改为 1 秒刷新的本地缓存 + `/purge` 与面板手动刷新 | 手机上没有桌面热重载竞态 |
| `$DSH_HOME/prompt-inject.md` + 加密槽 | `$DSH_HOME/dsh-go-purge/personas/*.md` + `state.json` | 与桌面 `rules/` 分离，避免互相污染 |
| `/purge apply\|revert\|uninstall\|edit` | 去掉；只保留 status/use/list/mode/reset | 没有 asar/shim/编辑器/重启目标 |
| `core.js` 339KB（asar、shim、PowerShell、官方升级、cmd-flash） | 不移植 | 桌面专属，手机上无意义且易破坏 App |
| `hooksDenyBypass` / `danger-full-access` 权限钉 | 不移植 | dsh-go 明确禁止插件批准工具调用或改权限 |
| `client.js`（Web 设置页）+ 十几个 HTTP 路由 | `package.json` 的 `dshGo` 清单 + `ctx.dshGo` 原生插槽 | App 不执行插件代码，只渲染 JSON 视图 |
| `lib/redteam/*` + 23 个 redteam skill + SQLite store | 不移植；保留人设机制，可由用户把红队人设写成 persona | 手机端以原生面板为主，演练台 Web 控制台无处安放 |
| `autoRetry` / `continue` / `rewind` | 不移植 | 依赖桌面 session 事件与特定 UI 行为 |
| `capability-protocol` | 精简版 `capabilityText()` | 让模型先读 skill/MCP 再按任务选用 |
| `presentationMeta` 工具卡 | 保留，`toolCard()` 8 KiB 降级 | 任何主机都能显示 |

## 已验证

- `node --test test/*.test.js`：6/6 通过。
- `sdk/plugin-kit/bin/check.mjs . --load`：退出码 0；原生插槽 2 胶囊 + 1 状态条 + 2 面板 + 1 对话操作；工具 `purge_status`、`purge_use` 已加载；所有面板视图中英双语可显示。

## 未验证 / 需真机确认

- dsh-go App 的具体版本对 `v:2` 表单、`chat.panel` placement 的支持（老 App 会降级）。
- `$DSH_HOME` 在手机 PRoot 环境里的实际值；插件用 `DSH_HOME` → `DSH_GO_HOME` → `~/.dsh` → `/root/.dsh` 顺序探测。
- 面板数据订阅频率（5 秒）在真机上的耗电表现。
