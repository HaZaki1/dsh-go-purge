---
name: dsh-go-purge
description: 查看或切换 dsh-go-purge 的注入人设、模式与状态；当用户问“当前人设/破甲状态/换人设/关闭注入”时使用。
whenToUse: 用户要求查看、切换或关闭提示词人设，或排查模型自称身份与预期不符时使用。
disable-model-invocation: false
user-invocable: true
---

# dsh-go-purge

本机提示词接管插件。先读状态，再按用户要求操作。

- 看状态：调用 `purge_status`，它同时给出人设、模式、目录与正文长度。
- 换人设：先用 `purge_status` 或 `/purge list` 确认 id，再调用 `purge_use`。切换对新会话生效；告诉用户这一点。
- 改模式或恢复默认：用 `/purge mode replace|append|off` 与 `/purge reset`。
- 不要声称自己改了宿主程序或权限：本插件只写提示词段，审批与权限仍由 dsh-go App 控制。

人设正文随模型请求发送；不要在其中写入密钥或隐私数据。
