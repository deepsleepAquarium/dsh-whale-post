# dsh-whale-post-cli

零依赖命令行：hello／send／pump／quota／roster／types／selftest

* 提供接口：（无：它是命令行工具，不是插件）
* 依赖接口：`ctx.whale.bus`、`ctx.whale.gate`、`ctx.whale.roster`、`ctx.whale.types`
* 自测：`node selftest.mjs`（**只看退出码**：0 过／非 0 不过）

接口带 `apiVersion`；核心不认识任何成员名与类型标识 —— 名单与类型一律从接口取。
