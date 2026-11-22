# 署名与来源

本适配版派生自本机安装的 `dsh-purge@1.1.71`。

- **原始项目**：[YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge)，作者：**小杨**。
- **本版来源**：[ZXEB/dsh-purge](https://github.com/ZXEB/dsh-purge) v1.1.71（原仓库与 npm 包已删除，ZXEB 为保存与再分发镜像）。
- **原始许可**：MIT；原作者另有署名要求：借用本项目的名称、思路、代码或提示词，必须署名并写明来源仓库；去掉署名、隐去来源、据为己有会被追究。
- **本适配版**：`dsh-go-purge`，把引擎侧提示词注入、人设/规则能力迁到 dsh-go 原生插件形态；删除桌面 asar/shim/重启/网页控制台/审批绕过相关代码。

随包文件 `assets/default-prompt.md` 是从 `dsh-purge@1.1.71` 的加密默认槽解出的**原始提示词全文**，未改写，按上述要求保留署名。

dsh-go 原生插件协议与 `sdk/plugin-kit` 来自 [ccch1mneyyy/dsh-Go](https://github.com/ccch1mneyyy/dsh-Go)，MIT（sdk/、examples/）。
