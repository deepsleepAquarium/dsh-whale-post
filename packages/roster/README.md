# dsh-whale-post-roster

名单接口（谁在名单里）＋ 读 JSON 的样例实现

* 提供接口：`whale.roster`
* 依赖接口：（无）
* 自测：`node selftest.mjs`（**只看退出码**：0 过／非 0 不过）

接口带 `apiVersion`；核心不认识任何成员名与类型标识 —— 名单与类型一律从接口取。
