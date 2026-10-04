# dsh-whale-post-bus

核心：信封／签名／握手／幂等／落盘

* 提供接口：`whale.bus`
* 依赖接口：（无）
* 自测：`node selftest.mjs`（**只看退出码**：0 过／非 0 不过）

接口带 `apiVersion`；核心不认识任何成员名与类型标识 —— 名单与类型一律从接口取。
