# 安装到 dsh-go 手机版

打包件：[dsh-go-purge.zip](../dsh-go-purge.zip)（31 KB，解压后顶层是 `dsh-go-purge/`）。
源目录：[dsh-go-purge/](../dsh-go-purge/)（改代码后用这个）。

关键前提：**命令要在 dsh-go App 自带的「本机终端」里执行**，路径是手机 Linux 环境里的路径（`/root` 是家目录），不是 Windows 路径。profile 用 `web`。

---

## 一、把插件弄进手机

### 方式 A：adb（最快，开发时用）

在 Windows 上执行：

```powershell
adb push D:\.YunLogin\dsh-go-purge.zip /sdcard/Download/
```

然后跳到第二步。

### 方式 B：手机存储

把 `dsh-go-purge.zip`（或整个 `dsh-go-purge` 文件夹）拷到手机的「下载」目录。
在 dsh-go「设置」里打开「访问手机文件」后，本机环境里对应 `/sdcard/Download/`。

### 方式 C：让 App 里的 agent 写

直接对 dsh-go 说：「写一个 dsh-go 原生插件，实现提示词人设切换」。
App 自带的 `dsh-go-plugin` 技能会生成并安装；但那不是本插件，需要的功能要说明白。

---

## 二、在本机终端解压 + 安装

打开 dsh-go 的「终端」，执行：

```sh
mkdir -p /root/.dsh/dsh-go/plugins
cd /root/.dsh/dsh-go/plugins
unzip /sdcard/Download/dsh-go-purge.zip
ls -la dsh-go-purge
```

放到 `/root/.dsh/dsh-go/plugins/` 的原因：App「重置引擎」时这个目录默认保留。

然后安装（**装上即生效，不用重启**）：

```sh
dsh plugin --profile web add /root/.dsh/dsh-go/plugins/dsh-go-purge
```

验证清单已挂上：

```sh
dsh --profile web --dump-config | grep dsh-go-purge
```

看到 `dsh-go-purge` 相关行即成功。

---

## 三、重启一次引擎并新开会话

虽然文档说装上即生效，但本插件带 `lib/` 代码，稳妥起见：

1. dsh-go「设置 → 引擎」里重启本机引擎；
2. **新开一个对话**（旧对话的 system prompt 已经冻结，不会回溯）；
3. 输入框上方应出现「状态」「切人设」两个胶囊和一条 `人设 ...` 状态条；
4. 对话详情页「插件」页签里有「破甲控制台」。

确认插件真的在注入：

```
/purge status
```

应看到 `生效人设: little-code-sauce`、模式 `replace`、正文长度约 21000 字。

---

## 四、日常操作

| 想做什么 | 命令 / 位置 |
|---|---|
| 看状态 | `/purge status`，或点「状态」胶囊 |
| 列人设 | `/purge list` |
| 切人设 | `/purge use <id>`，或在控制台面板点人设 |
| 改模式 | `/purge mode replace\|append\|off` |
| 恢复默认 | `/purge reset` |
| 编辑短人设 | 控制台「人设编辑」面板（≤2000 字） |

状态文件在手机上的 `/root/.dsh/dsh-go-purge/`。

---

## 五、更新与卸载

**更新**：改了 `lib/` 后，卸载再装不会重新加载已载入的代码，必须重启引擎：

```sh
dsh plugin --profile web remove dsh-go-purge
# 把新目录拷回 /root/.dsh/dsh-go/plugins/dsh-go-purge
dsh plugin --profile web add /root/.dsh/dsh-go/plugins/dsh-go-purge
# 然后重启本机引擎
```

**卸载**：

```sh
dsh plugin --profile web remove dsh-go-purge
```

人设数据（`dsh-go-purge/` 下的 `personas/`、`state.json`）不会被删；想清干净就手动删那个目录。

---

## 六、在电脑上先测试（可选）

本机没有 `dsh` 在 PATH 上，但 DSH 自带 CLI：

```powershell
$env:PATH = "D:\浏览器下载\DSH NEXT\resources\app\node_modules\@deepseek-ai\dsh\bin;$env:PATH"
dsh --version
dsh plugin --profile web add D:\.YunLogin\dsh-go-purge
dsh --profile web --dump-config
```

电脑上的网页版 DSH 只显示工具卡（`purge_status` / `purge_use`），胶囊和面板是 dsh-go App 专属。

---

## 故障排查

| 现象 | 检查 |
|---|---|
| `add` 报版本不兼容 | `dsh --version`；插件支持 `>=0.2.1-rc.2 <0.3.0-0` |
| 装上但界面没变化 | 是否用了 `web` profile；是否新开会话；是否重启了引擎 |
| 面板里显示「插件界面有误」 | App 版本太老，v2 表单不支持；用旧 App 会用 v1 降级 |
| 提示词没生效 | `/purge status` 看模式是不是 `off`；/purge mode replace |
| 目录被删后插件失效 | 安装是链接，目录要留着；重装一次 |
