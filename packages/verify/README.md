# dsh-whale-post-verify

安全校验（信封验签 ＋ 名单白名单）；★默认禁用，禁用期间会提示开启，连提三天后不再提

* 提供接口：`whale.verify`
* 依赖接口：`whale.bus`（可选 —— 借它的 `digest`／`sign`，拿不到就用内置实现）
* 自测：`node selftest.mjs`（**只看退出码**：0 过／非 0 不过）

接口带 `apiVersion`；核心不认识任何成员名与类型标识 —— 名单与类型一律从接口取。

## 三态（★为什么默认禁用）

| 状态 | 行为 |
|---|---|
| **已开启** | 验签 ＋ 白名单；不提示 |
| **未开启 · 第 1～3 天** | 每次启动（或每日一次）提示：**安全校验禁用中**，建议开启以免未知 agent 对其他 agent 发起欺骗或攻击，并给出一句开启方法 |
| **未开启 · 第 4 天起** | **不再提示** —— 视为用户执意要在不安全的环境下使用；但 `status()` **永远**如实显示 `enabled: false` |

★「不再提示」≠「关掉了安全」：任何时候把 `enabled` 打开就立刻生效。

## 接口

| 方法 | 说明 |
|---|---|
| `verify(letter)` → `{ ok, why?, skipped? }` | 核心只问这一句。**禁用时放行但带 `skipped: true`**（不许假装验过）；开启时 **fail-closed** |
| `nag()` → `string \| null` | 该提示就返回文案，不该提示返回 `null`（核心不必懂"三天规则"） |
| `status()` → `{ enabled, dayIndex, willNag, … }` | 如实状态；`enabled` 永远是真相 |
| `enable()` / `disable()` | 开／关；开启时刻会留痕在 `state/security-nag.json` |

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `false` | ★默认禁用（有意的） |
| `allow` | `[]` | 白名单：允许的成员 id；**空数组 ⇒ 不限制收件人** |
| `nagDays` | `3` | 连提几天后不再提 |
| `dayBoundaryHour` | `0` | 日界（0 ＝ 自然日；写 9 就是"早九点到次日早九点算一天"） |
| `root` | `WHALE_POST_ROOT` / `./.whale-mail` | 信箱根；状态写 `<root>/state/security-nag.json` |
| `keyFile` | `<root>/signing.key` | 共享钥匙（32 字节 hex） |
| `keysDir` | `<root>/keys` | 每设备钥匙目录；**按信封声明的发件人取钥**，没有专用钥就回落共享钥 |

## 验签口径

* 签名域与 `dsh-whale-post-bus` 的 `FIELD_ORDER` **完全一致**（★`mode` 也在里面）；
* 优先借 `whale.bus` 的 `digest`／`sign` —— 保证"与核心同一套算法，不各算各的"；
* 开启后 **fail-closed**：缺字段／**出现未登记字段**／正文摘要不符／签名不符／不在白名单 ⇒ 一律不过。
