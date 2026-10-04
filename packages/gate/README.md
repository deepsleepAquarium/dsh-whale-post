# dsh-whale-post-gate

配额与计费闸 ＋ 回环闸（示例②的挂点）

* 提供接口：`whale.gate`
* 依赖接口：`ctx.whale.bus`、`ctx.whale.types`
* 自测：`node selftest.mjs`（**只看退出码**：0 过／非 0 不过）

接口带 `apiVersion`；核心不认识任何成员名与类型标识 —— 名单与类型一律从接口取。
