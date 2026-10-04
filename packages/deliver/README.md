# dsh-whale-post-deliver

投递策略：离线留在信箱等人／在线立刻投出（示例①的挂点）

* 提供接口：`whale.deliver`
* 依赖接口：`ctx.whale.bus`、`ctx.whale.roster`
* 自测：`node selftest.mjs`（**只看退出码**：0 过／非 0 不过）

接口带 `apiVersion`；核心不认识任何成员名与类型标识 —— 名单与类型一律从接口取。
