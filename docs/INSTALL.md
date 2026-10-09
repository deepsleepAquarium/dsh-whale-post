# 安装与接线（INSTALL）

> English: [INSTALL.en.md](INSTALL.en.md)

## 〇、前置
* 一个支持插件与依赖注入的引擎（本仓按 Cordis 风格写：`cordis.patch.yml` ＋ `ctx` 服务）。
* **Node ≥ 20**。本仓**零运行时依赖**（只用 `node:` 内置模块）。

## 一、装
```bash
# 发布后从 registry 装
dsh plugin --profile <profile> add dsh-whale-post

# 本地开发：必须用 link:（改源码即生效）
dsh plugin --profile <profile> add link:/abs/path/to/dsh-whale-post
```
★**两条老实话（我们用血换的）**：
1. ★`file:` 装本地包＝**复制快照** ⇒ 你改源码**不生效**；要改就 `link:`（或目录联接）。
2. ★运行中的引擎**按 URL 缓存 ESM** ⇒ **改完代码必须重启引擎**（改一行也重启，否则你测的是旧码）。

## 二、最小接线（`cordis.patch.yml`）
```yaml
- insert:
 - id: whale-bus
 name: dsh-whale-post-bus
 config:
 root: '~/.dsh/whale-mail' # 信箱根，自定；★不写则代码默认 ./.whale-mail（当前目录）
 apiVersion: 1

 - id: whale-roster-json
 name: dsh-whale-post-roster
 config:
 file: '~/.dsh/whale-mail/roster.json' # 名单内容由你填

 - id: whale-types-sample
 name: dsh-whale-post-types
 config:
 types: [direct, broadcast, club] # 示例类型；你自己的类型自己注册

 - id: whale-deliver
 name: dsh-whale-post-deliver # 示例①：离线邮局

 - id: whale-gate
 name: dsh-whale-post-gate # 示例②：配额与计费闸
 config:
 dailyUnits: 120 # ★ 数值自定（示例值，别照抄）

 - id: whale-verify
 name: dsh-whale-post-verify # ★安全校验（验签 ＋ 白名单）
 config:
 enabled: false # ★默认禁用；要开就写 true（禁用期间会提示你开启，连提三天后不再提）
```
★**接线要点**：六个插件之间**只靠接口**（`ctx.whale.*`）⇒ **书写顺序无关**；★核心**不认识任何名字与类型** —— 你换掉名单实现、改掉类型表，核心一行都不用动。

### 名额从哪来（名单文件示例）
```json
{ "apiVersion": 1,
 "members": [ { "id": "alice", "label": "Alice" },
 { "id": "bob", "label": "Bob" } ] }
```
★`id` 是投递用的**信箱目录名**（`<root>/inbox/<id>/`）；★**列表内容不进代码**。

## 三、装上了没有

> ★**本仓尚未发 npm** ⇒ 下面一律用**仓内路径**跑（`node packages/cli/index.js …`）。装到 profile 之后，也可以用包名调用（`dsh-whale-post-cli`）。（★判据）
```bash
node packages/cli/index.js selftest # ★只看退出码：0 = 过；非 0 = 不过（别看中文）
node packages/cli/index.js send --as alice --to bob --subject 'hello' --body 'first letter'
node packages/cli/index.js pump --as bob # 把 bob 的信箱读一遍（★消费掉）
```
★**三条硬规矩**：① **只看退出码**（不匹配中文）；② **能原地重复跑**（两次结果一致）；③ ★**负向测试**：**故意改坏一行 ⇒ 自测必须变红**（不红＝自测是摆设）。

★**本仓自带的跑法**（还没装也能验）：`node scripts/selftest-all.mjs` ⇒ **退出码 0 ＝ 七件全过**；单件跑 `node packages/<件名>/selftest.mjs`。
★**从 npm 装**（已发布）：`npm i dsh-whale-post-cli` ⇒ `npx dsh-whale-post-cli selftest`。

★★**收信语义（重要，别跳过）**：`pump` 默认**会消费**（把信搬进 `seen/` ＋ 写 ack）—— **但**当收信人此刻**没有活体会话**、也没有任何东西声明"我就是读者"时，`pump` **一封都不消费**：信**原样留在 `inbox/`** 里（不搬 `seen`、不删原件、不写 ack）。
★要让"投不出去的信"留在信箱，用 `keep`：`keep: true`（只看不消费）或 `keep: (letter) => boolean`（逐封判）；命令行用 `--keep`。★要消费就得**声明自己是读者**：`reader: true`（CLI 把信打进终端时就是这么做的）。
★这是"**信只会晚到，不会不到**"的**收信侧那一半** —— 少了它，信会在"收件人不在"的时候被默默吃掉。

★★**接真引擎的唯一接线口：`sessionOf` 探针（这一段是"接引擎"必读）**
★核心**不认识"引擎""会话"**这些概念 —— 它只认一个探针函数：
```js
sessionOf(id) => ({ live: true, inject: (text) => { /* 把这段文字送进那个会话 */ } })   // 或 undefined
```
★两种接法（等价）：
* `createBus({ probes: { sessionOf } })` —— 直接喂给核心；
* 把 `dsh-whale-post-deliver` 配好 `sessionOf` —— 核心会自动取 `services.deliver.sessionOf`。

★规则三句（**别混**）：
1. ★**它只影响"在线件能不能真投出去"** —— 探针说"没这个会话"（或压根没接探针）⇒ 在线件判 **`kept`**：**信留在 `inbox/` 等人**（**只晚到，不会不到**）；
2. ★**`pump` 的消费授权不看它** —— 要消费得给 `inject` 或声明 `reader: true`（**"会话活着"≠"信交到了读者手里"**）；
3. ★**给了 `inject` 就会真调它，它抛异常 ⇒ 不消费** —— 交不出去的信，绝不当成交出去了。

## 四、包与接口一览
| 包 | 角色 | 提供／依赖的接口 |
|---|---|---|
| `dsh-whale-post-bus` | 核心：信封／摘要＋HMAC 签名／握手／幂等／落盘 | 提供 `ctx.whale.bus` |
| `dsh-whale-post-roster` | **谁来收**（接口件 ＋ 读 JSON 的样例） | 提供 `ctx.whale.roster` |
| `dsh-whale-post-types` | **信是什么类型**（接口件 ＋ 样例） | 提供 `ctx.whale.types` |
| `dsh-whale-post-deliver` | **投递策略**（＝示例①的挂点） | 用 `bus`／`roster` |
| `dsh-whale-post-gate` | **闸**（＝示例②的挂点） | 用 `bus`／`types` |
| `dsh-whale-post-verify` | **安全校验**（信封验签 ＋ 名单白名单），★默认禁用 | 用 `bus`（可选：借它的 `digest`／`sign`） |
| `dsh-whale-post-cli` | 入口工具（★**不是插件**） | 用 `bus` |
| `example/` | 组合示例：最小 `cordis.patch.yml` ＋ 跑一次的判据 | 全部 |

★接口最小方法集（★**带 `apiVersion`**，允许随时扩充类型）：

| namespace | 方法 |
|---|---|
| `ctx.whale.bus` | `send(letter)` ／ `pump({ as, keep })` ／ `verify(letter)` |
| `ctx.whale.roster` | `list()` ／ `has(id)` ／ `label(id)` |
| `ctx.whale.types` | `register(id, meta)` ／ `resolve(id)` ／ `list()` |
| `ctx.whale.deliver` | `deliver(letter, ctx)` → `'delivered'` ／ `'kept'` ／ `'rejected'` |
| `ctx.whale.gate` | `check(letter, ctx)` → `'pass'` ／ `{ reject, reason }` |
| `ctx.whale.verify` | `verify(letter)` → `{ ok, why?, skipped? }` ／ `nag()` → `string \| null` ／ `status()` ／ `enable()` ／ `disable()` |

## 五、★写插件的规范（照着写，别踩我们的坑）
1. ★**只认接口，不认名字**：不许在核心代码里硬编码**任何**成员名／类型标识／内部路径（名单与类型一律注册进来）。
2. ★形状：`export const name = '...'` ＋ `export function apply(ctx, config = {})`。
3. ★**顶层零 I/O、零副作用**：模块被 `import` 的那一刻不许读盘、不许发信、不许起定时器（一切放进 `apply`）。
4. ★**不要用 `inject`**（未满足时会**静默挂起**，你连日志都看不到）⇒ 改成**运行时取服务**：`ctx.get('whale.bus')`。
5. ★**服务缺席不炸**：取不到就记一笔、**下个 tick 再试**（插件加载早于服务注册是常态）。
6. ★**日志做"状态变化才记一笔"**：否则一个 tick 一行、日志刷成瀑布（我们真刷过）。
7. ★**异常自己吞**：绝不把异常抛回引擎（一个抛不出去的错能带走整台引擎）。
8. ★**一切可配**：根目录／间隔／署名／路径全部走 `config`，代码里不写死。
9. ★**带 `apiVersion`**：类型标识与信封格式都留版本位（"随时可扩充"是硬需求）。
10. ★**落盘原子**：写临时文件 ＋ `rename`（半截文件＝一次假死）。
11. ★★**签名要覆盖全部语义字段**：漏签一个字段（比如 `mode`／优先级）＝ 别人能悄悄改写它（★我们就是靠"`mode` 也进签名"堵住的）。
12. ★**幂等**：同一封信只消费一次（按消息 id 去重）；★重放不许重复投递。
13. ★**默认离线**：要叫醒对方必须**显式** `online` —— ★别让"默认在线"把别人的会话冲了。
14. ★**交件前**：**加载级自测** ＋ `selftest` 变绿 ＋ **真启一遍看日志无加载错** —— ★语法过、模块级自测过，**都不算**（我们就是这么栽的：7 个入口全崩在同一行）。

## 六、常见故障
| 症状 | 多半是 | 处置 |
|---|---|---|
| 插件装了但"没反应" | 用了 `inject` ／ 顶层就取服务 | 改运行时取服务 ＋ 每 tick 重试 |
| ★**装了、`--dump-config` 也看得到层，但一真启就 `failed to apply`** | ★`apply()` 里**读了 `ctx.whale` 属性**（真 Cordis 里读它要先 `inject` ⇒ 抛 `cannot get property "whale" without inject`）；★`--dump-config` 只组配置树、**不跑 `apply()`**，所以看不出来 | ★只写 `ctx.provide('whale.xxx', x)` ＋ 运行时 `ctx.get('whale.xxx')`，**别碰 `ctx.whale` 属性**；★验的时候**必须真启一遍**，`--dump-config` 不算（2026-10-10 六件全栽在这 ✗） |
| 改了代码没变化 | ESM 按 URL 缓存 ／ `file:` 装的是快照 | 重启引擎 ＋ 改 `link:` 装 |
| 引擎起不来、日志一行 `ReferenceError` | 常量没定义（我们真干过） | 跑加载级自测＋负向测试 |
| 收件人"没收到" | 对方**没有活体会话** | 正常：信**留在信箱里等人**，**不会丢** |
| 日志 4 秒一行 | 日志没做状态变化判断 | 见规范第 6 条 |

---
