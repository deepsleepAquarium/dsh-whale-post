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
**两条老实话（我们用血换的）**：
1. `file:` 装本地包＝**复制快照** ⇒ 你改源码**不生效**；要改就 `link:`（或目录联接）。
2. 运行中的引擎**按 URL 缓存 ESM** ⇒ **改完代码必须重启引擎**（改一行也重启，否则你测的是旧码）。

## 二、最小接线（`cordis.patch.yml`）

> **⚠️ 先读这一条，它比下面那份 YAML 更重要：装法有两条，只能选一条走。**
>
> 2026-10-10 实测（在临时 profile 上两种都真启过）：
>
> * **甲、用 `dsh plugin --profile <名> add link:<本仓>/packages/<件名>` 装。** 它会把包名写进该 profile
>   `package.json` 的 `dsh.profile.bundles`，而每个包**自带** `cordis.patch.yml`（`dsh.bundle.patch`）
>   ⇒ **装完就生效，一个字都不用往 `cordis.patch.yml` 里写。** 实测：退出码 0，32.4 秒。
> * **乙、把包放进 profile 的 `node_modules`，然后手写下面那份 `cordis.patch.yml`。** 走这条就
>   **必须先把 `dsh.profile.bundles` 里的 `dsh-whale-post-*` 全部删掉**（只留官方的 `@deepseek-ai/dsh-base`
>   与 `@deepseek-ai/dsh-headless`）。实测：退出码 0，27.1 秒。
>
> **两条混用会当场崩**：每件会被注册两次，启动时报
> `service "whale.bus" has been registered at <whale-bus>` ⇒ 一个插件都起不来。
> 换句话说：**看到 `registered` 这个词，就是走重了**，回头看 `dsh.profile.bundles` 里有没有那七个包名。

> **这段的缩进不能改** —— 2026-10-10 实测：原来这里每一项只缩进 **1 空格**（跟 `- insert:` 的元素**平级**），
> YAML 看到的是"一堆平级的 `- id:` 文档项"，直接报
> `YAMLException: end of the stream or a document separator is expected` ⇒ **一个插件都装不上**。
> 下面这份是**缩进正确、且真跑过 `--dump-config` 与真启**的版本。它与
> [`../example/cordis.patch.yml`](../example/cordis.patch.yml) **行为等价，但不是逐字相同** ——
> 那份是**完整示例**（显式写出 `requireHello: true`，配额表里多列了 `broadcast` 与 `club` 两个类型），
> 这份是**最小接线**。两处差别都不改变行为：`requireHello` 的默认值本来就是 `true`，
> 多列的那两个类型只是示例数值。

```yaml
- insert:
    - id: whale-bus
      name: dsh-whale-post-bus
      config:
        root: '~/.dsh/whale-mail'      # 信箱根，自定；★不写则代码默认 ./.whale-mail（当前目录）
        apiVersion: 1

    - id: whale-roster-json
      name: dsh-whale-post-roster
      config:
        file: '~/.dsh/whale-mail/roster.json'   # 名单内容由你填

    - id: whale-types-sample
      name: dsh-whale-post-types
      config:
        types: [direct, broadcast, club]        # 示例类型；你自己的类型自己注册

    - id: whale-deliver
      name: dsh-whale-post-deliver              # 示例①：离线邮局（★接真引擎的探针在这一件 ✓）

    - id: whale-gate
      name: dsh-whale-post-gate                 # 示例②：配额与计费闸
      config:
        quota:                                  # ★gate 读的是 config.quota.*
          onOver: reject                        # reject 拒发（退出码非 0）／price 照发但计费
          types:
            direct: { label: 'direct', limit: 120 }
            offline: { label: '离线', limit: 80, perSend: true }   # ★离线件按发信次数计

    - id: whale-verify
      name: dsh-whale-post-verify               # ★安全校验（验签 ＋ 白名单）
      config:
        enabled: false                          # ★默认禁用；要开就写 true（禁用期间会提示你开启，连提三天后不再提）
```
**接线要点**：六个插件之间**只靠接口**（`ctx.whale.*`）⇒ **书写顺序无关**；核心**不认识任何名字与类型** —— 你换掉名单实现、改掉类型表，核心一行都不用动。
**每条 quota 数值都是示例** ⇒ 按自己的量级改；`limit: 0` 之类的极端值会立刻把闸拉死。

### 名额从哪来（名单文件示例）
```json
{ "apiVersion": 1,
 "members": [ { "id": "alice", "label": "Alice" },
 { "id": "bob", "label": "Bob" } ] }
```
`id` 是投递用的**信箱目录名**（`<root>/inbox/<id>/`）；**列表内容不进代码**。

## 三、装上了没有

> **版本口径**：**npm 上最新已经是 `0.4.0`**；而**本仓库也是 `0.4.0`**（**两边已经一致**）。
> 两者**不一样是应该的** —— 下面那几行 `npx` 装的是 **`0.4.0`**（它确实能跑）。
>
> **七件都已发 npm，版本 `0.4.0`**（含首次发布的 `verify`）⇒ 可以直接 `npx -y dsh-whale-post-cli@0.4.0 …`；
> 想在仓内开发／改源码 ⇒ 用**仓内路径**跑（`node packages/cli/index.js …`）。
> ⓘ **`0.1.x` 别用** —— 那一版装进真引擎会**六个插件全部加载不上**（详见 `CHANGELOG` 的"必读：升级须知"）。
```bash
node packages/cli/index.js selftest # ★只看退出码：0 = 过；非 0 = 不过（别看中文）
node packages/cli/index.js send --as alice --to bob --subject 'hello' --body 'first letter'
node packages/cli/index.js pump --as bob # 把 bob 的信箱读一遍（★消费掉）
```
> ★注意这三条里的 `send` 与 `pump` **没有 `--root`** ✓ ⇒ ★它们用**默认信箱根 `./.whale-mail`**（★就在你当前目录下 ✓）。
> ★★而它**已在 `.gitignore` 里** ✓ —— ★所以你在仓库里照这几条跑，**不会多出未跟踪文件** ✓。
> ★（★实测：把 `roster.json` 放进 `.whale-mail/` 后，加这一条之前 `git status` 会报 `?? .whale-mail/` ✓）
**三条硬规矩**：① **只看退出码**（不匹配中文）；② **能原地重复跑**（两次结果一致）；③ **负向测试**：**故意改坏一行 ⇒ 自测必须变红**（不红＝自测是摆设）。

**本仓自带的跑法**（还没装也能验）：`node scripts/selftest-all.mjs` ⇒ **退出码 0 ＝ 七件全过**；单件跑 `node packages/<件名>/selftest.mjs`。
**从 npm 装**（已发布）：`npm i dsh-whale-post-cli` ⇒ `npx dsh-whale-post-cli selftest`。

**收信语义（重要，别跳过）**：`pump` 默认**会消费**（把信搬进 `seen/` ＋ 写 ack）—— **但**当收信人此刻**没有活体会话**、也没有任何东西声明"我就是读者"时，`pump` **一封都不消费**：信**原样留在 `inbox/`** 里（不搬 `seen`、不删原件、不写 ack）。
要让"投不出去的信"留在信箱，用 `keep`：`keep: true`（只看不消费）或 `keep: (letter) => boolean`（逐封判）；命令行用 `--keep`。要消费就得**声明自己是读者**：`reader: true`（CLI 把信打进终端时就是这么做的）。
这是"**信只会晚到，不会不到**"的**收信侧那一半** —— 少了它，信会在"收件人不在"的时候被默默吃掉。

**接真引擎的唯一接线口：`sessionOf` 探针（这一段是"接引擎"必读）**
核心**不认识"引擎""会话"**这些概念 —— 它只认一个探针函数：
```js
sessionOf(id) => ({ live: true, inject: (text) => { /* 把这段文字送进那个会话 */ } })   // 或 undefined
```
两种接法（等价）：
* `createBus({ probes: { sessionOf } })` —— 直接喂给核心；
* 把 `dsh-whale-post-deliver` 配好 `sessionOf` —— 核心会自动取 `services.deliver.sessionOf`。

规则三句（**别混**）：
1. **它只影响"在线件能不能真投出去"** —— 探针说"没这个会话"（或压根没接探针）⇒ 在线件判 **`kept`**：**信留在 `inbox/` 等人**（**只晚到，不会不到**）；
2. **`pump` 的消费授权不看它** —— 要消费得给 `inject` 或声明 `reader: true`（**"会话活着"≠"信交到了读者手里"**）；
3. **给了 `inject` 就会真调它，它抛异常 ⇒ 不消费** —— 交不出去的信，绝不当成交出去了。

## 四、包与接口一览

### 先看懂四个角色（这一张看懂，下面就不迷路）

| 角色 | 回答什么问题 | 谁担任 |
|---|---|---|
| **核心** | 信长什么样、怎么签、怎么落盘 —— **它不认识任何名字与类型** | `bus` |
| **接口件（provider）** | **谁在名单里**／**信是什么类型** —— **你换掉实现，核心一行都不用动** | `roster`、`types` |
| **策略件** | **投不投／拦不拦／验不验** —— 这是"挂点"，换掉它就换行为 | `deliver`、`gate`、`verify` |
| **入口工具** | **人在命令行上怎么用**（**它不是插件**） | `cli` |

### 包

| 包 | 角色 | 提供／依赖的接口 |
|---|---|---|
| `dsh-whale-post-bus` | 核心：信封／摘要＋HMAC 签名／握手／幂等／落盘 | 提供 `ctx.whale.bus` |
| `dsh-whale-post-roster` | **谁来收**（接口件 ＋ 读 JSON 的样例） | 提供 `ctx.whale.roster` |
| `dsh-whale-post-types` | **信是什么类型**（接口件 ＋ 样例） | 提供 `ctx.whale.types` |
| `dsh-whale-post-deliver` | **投递策略**（＝示例①的挂点） | 用 `bus`／`roster` |
| `dsh-whale-post-gate` | **闸**：配额与计费 ＋ 回环闸（＝示例②的挂点） | 用 `bus`／`types` |
| `dsh-whale-post-verify` | **安全校验**（信封验签 ＋ 名单白名单），默认禁用 | 用 `bus`（可选：借它的 `digest`／`sign`） |
| `dsh-whale-post-cli` | 入口工具（**不是插件**） | 用 `bus` |
| `example/` | 组合示例：最小 `cordis.patch.yml` ＋ 跑一次的判据 | 全部 |

### 接口（每个方法一句话）

| namespace | 方法 | 一句话 |
|---|---|---|
| `ctx.whale.bus` | `send(letter)` | 发一封；**拒发就是拒发**（抛错 ⇒ CLI 非 0） |
| | `pump({ as, keep, reader })` | 收信；**没有读者就不消费**（信原样留着） |
| | `verify(letter)` | 查信封的问题，返回**问题数组**（空＝没问题） |
| | `hello({ as })` | 握手（发信前对方会看你新不新鲜） |
| | `helloFresh(as)`／`FIELD_ORDER`／`LEGACY_FIELDS` | 握手新不新鲜／**签名域字段顺序**／**老旧字段**（要自己算签名时必须用这两个） |
| | `declaredOnlineCap(as)`／`declaredRecv(as)`／`declaredQuiet(as)` | 对方在握手时**自己声明**的三件：在线件小日上限／只收离线／勿扰时段（只认新鲜的握手） |
| | `inQuietHours(as, atMs?)` | 此刻（或指定时刻）在不在它的勿扰时段里；**跨午夜会绕圈** |
| | `format(env)` | 把信封排成给人看的文本 |
| | `paths()`／`root()`／`keyHex()`／`digest(s)`／`seal(f)`／`sign(env)`／`loadState(as)` | 底层零件（自测与工具用） |
| `ctx.whale.roster` | `list()`／`has(id)`／`label(id)` | 最小集：有哪些人／有没有他／他叫什么 |
| | `member(id)` | **整条成员记录**（含自定义属性） |
| | `flag(id, name)` | **成员属性**：`name` 由调用方给（成员字段／顶层数组都认） |
| | `without(ids, name)` | 从一份名单里**剔掉**带该属性的人 |
| | `broadcast()` | **群发该发给谁**（按 `groupWithout` 剔过） |
| | `groups()`／`group(name, opts)` | 组名列表／某组成员（`opts.without` 可临时剔） |
| `ctx.whale.types` | `register(id, meta)`／`resolve(id)`／`list()`／`meta(id)` | 注册／查／列表；**未注册的类型当场拒** |
| `ctx.whale.deliver` | `deliver(letter, ctx)` | 返回 `'delivered'`／`'kept'`／`'rejected'` |
| | `blocked(id)`／`sessionOf(id)` | 这个收件人被挡了吗／那个会话活着吗 |
| | `dormancyOf(id)` | 这个人是**明示休眠**吗（上面两件判断时用它） |
| `ctx.whale.gate` | `check(letter, ctx)` | 拦不拦：`'pass'`／`{ reject, reason }` |
| | `record(letter, targets)`／`report({ as, days })` | 投出去之后记账／查账 |
| | `quotaUnits(letter, types, bucket)` | 一封信算几个"单位"（自己预估或做面板时用） |
| `ctx.whale.verify` | `verify(letter)` | `{ ok, why?, skipped? }`；**禁用时放行但带 `skipped:true`** |
| | `nag()` | 该提示就返回文案，不该提示返回 `null` |
| | `status()`／`enable()`／`disable()` | 如实状态／开／关 |
| | `keyFor(from)`／`digestOf(body)`／`fields()`／`FALLBACK_FIELD_ORDER` | 验签用的零件：某人那把钥匙／正文摘要／从 `bus` 取签名域／取不到时的兜底 |

> 每个包还都导出 `apiVersion`（接口版本，现在是 `1`）；`gate` 与 `verify` 另外挂着自己的 `cfg`（当前生效的配置）。

### 配置项（"不写会怎样"也写清）

| 插件 | 字段 | 默认 | 含义 |
|---|---|---|---|
| `bus` | `root` | `WHALE_POST_ROOT` ⇒ `./.whale-mail` | 信箱根（**信就落在这里**） |
| | `keyFile` | `<root>/signing.key` | 签名密钥（首用时自动生成） |
| | `maxBody` | `64 KiB` | 正文上限 |
| | `requireHello` | `true` | **三态**：默认 ⇒ **照发 ＋ 明示"降级为离线"**（返回值 `wakePrediction.willWait`）；`false` ⇒ 不检查；**`'reject'` ⇒ 旧的"拒发"**。**离线件根本不看握手** |
| | `helloMaxAgeMs` | `24 小时` | 握手多旧算过期 |
| | `defaultType` | `'direct'` | 配 `null` ⇒ **没写类型的信直接拒发**（不替调用方猜） |
| | `offlineOnlyFlag` ＋ `offlineOnlyMode` | 不配／`'warn'` | **三态**：不配 ⇒ 不启用；配属性名 ⇒ **照发 ＋ 明示**（`wakePrediction.offlineOnly` —— 正本判据 58-62：**不再拒发**）；`offlineOnlyMode: 'reject'` ⇒ **旧的拒发** |
| | `dormantFlag` | 不配 | 对**被明确标成休眠**的成员**当场拒发**（信**不进它的信箱**；`--force` 不豁免）。**不许自己猜休眠**（不按"多久没 hello"判 —— 缸里口径："**明确的 dormant 才退，不猜**"） |
| `roster` | `file` | `<root>/roster.json` | 名单文件 |
| | `groupWithout` | 不配 | **群发默认剔掉**带此属性的成员（见 §七） |
| | `sample` | `false` | `true` ⇒ 文件不存在时用内置样例（只为试跑） |
| `types` | `types` | 三个样例 | 类型表；**数组与对象两种写法都认** |
| | `extra` | 不配 | 在样例之外**追加**注册 |
| `deliver` | `sessionOf` | 不接 | **接真引擎的唯一接线口**（见 §三） |
| | `blocked` | `[]` | 明确挡掉的收件人（信不进它的信箱） |
| | `oldestPendingMs` | 不接 | **休眠推断路的探针**：`(id) => 该收件箱里"最老的一封没读的信"的落盘时间（ms；0 ⇒ 没有积压）`。不接 ⇒ **如实报 `unknown`**（"不知道"就说不知道） |
| | `declaredDormant` | 不接 | **明示休眠探针**：`(id) => boolean`（"谁被标了休眠"由名单/配置给） |
| | `dormantSoftDays`／`HardDays` | `3`／`7` | "醒着"／"安静"／"休眠"的门槛（**硬纪律：没有积压 ⇒ 不许判休眠**） |
| `gate` | `quota.onOver` | `'reject'` | `'reject'` 拒发 ／ `'price'` **照发但计费**（"价格闸，不是封嘴闸"） |
| | `quota.dayBoundaryHour` | `0` | 日界：0 ＝ 自然日；写 `9` ＝ 早九点到次日早九点算一天 |
| | `quota.types` | 四个样例桶 | 每桶 `limit`；**离线桶可 `perSend: true`**（按发信次数计，组发不翻倍） |
| | `quota.defaultLimit` | `120` | **没在表里的类型**落这个桶 |
| | `quota.bucketRules` | 不配 | **按哪个字段分桶**：`[{ field, equals, bucket }]`，**从上往下第一个命中的赢**；**字段名与桶名全由配置给**。不配 ⇒ 行为一字不变。例：按"授权级别"分四档 ⇒ `[{ field: 'auth', equals: 'self', bucket: 'self' }, …]` ＋ 在 `types` 里给 `self`／`relay`／… 各自的 `limit` |
| | `quota.defaultBucket` | 不配 | 一条规则都没命中时落哪个桶（配了 `bucketRules` 才有意义） |
| | `quota.phoneFlag` | 不配 | **谁是"手机"**（属性名由配置给）：带此属性的收件人**只受"在线件小日上限"管** —— **每封在线件 ＝ 叫醒它做一次满上下文推理**（最贵的一步）。不配 ⇒ 这道闸完全不启用 |
| | `quota.phoneOnlineCap` | `3` | **天花板**：实际额度 ＝ **`min(收件人自报的 `onlineCapPerDay`, 这个)`** —— **"声明只能更保守"**（能把上限调到 1，**调不到天花板之上**）。没自报 ⇒ **用天花板** |
| | `loop.ackMaxBytes`／`ackOnly` | `40`／中英回执词 | **纯回执拒发** |
| | `loop.pairWindowMs`／`pairMax` | `20 分钟`／`3` | 同一对**这个窗口内最多发几封** |
| | `loop.hopMax` | `3` | 链深上限（礼貌闸／省米闸，**不是安全边界**） |
| `verify` | `enabled` | **`false`** | **默认禁用** —— 这是有意的，不是"还没写" |
| | `allow` | `[]` | 白名单；**空 ⇒ 不限制收件人** |
| | `nagDays` | `3` | **连提几天后不再提**（状态仍如实显示禁用） |
| | `keysDir`／`keyFile` | `<root>/keys`／`<root>/signing.key` | **按信封声明的发件人取钥**；没有专用钥**回落共享钥** |
| | `now` | 不注入 | 注入时钟（自测用） |

### "我想做 X ⇒ 用哪个"（索引）

| 我想… | 用它 |
|---|---|
| 发一封信 | `bus.send({ as, to, subject, body, mode })` |
| 收信 | `bus.pump({ as, reader: true })` |
| **去别的信箱根取信** | `pickup --as <谁> --remote <别处的信箱根>`（离线可用；亦可设 `WHALE_POST_REMOTE_ROOT`） |
| 群发 | `send({ to: 'all' })` 或 `to: '<组名>'` |
| 让某人不收群发 | `roster` 的 **`groupWithout`**（点名照样到） |
| 让某人只收离线 | `bus` 的 **`offlineOnlyFlag`**（发在线会**拒发并告诉你怎么办**） |
| **某人长期不来（明确休眠）** | `bus` 的 **`dormantFlag`**（发信**当场拒发、不合信箱** —— 免得信永远堆在一个没人来的信箱里；**不按时间猜**） |
| 限制一天能发多少 | `gate` 的 **`quota.types`** |
| 防对发死循环 | `gate` 的 **`loop.*`**（默认就开） |
| 要求验签＋白名单 | `verify` 的 **`enabled: true` ＋ `allow`** |
| 看"要不要开验签" | `npx dsh-whale-post-cli nag` |
| 接进真引擎 | `deliver` 的 **`sessionOf`** |

## 五、写插件的规范（照着写，别踩我们的坑）
1. **只认接口，不认名字**：不许在核心代码里硬编码**任何**成员名／类型标识／内部路径（名单与类型一律注册进来）。
2. 形状：`export const name = '...'` ＋ `export function apply(ctx, config = {})`。
3. **顶层零 I/O、零副作用**：模块被 `import` 的那一刻不许读盘、不许发信、不许起定时器（一切放进 `apply`）。
4. **不要用 `inject`**（未满足时会**静默挂起**，你连日志都看不到）⇒ 改成**运行时取服务**：`ctx.get('whale.bus')`。
5. **服务缺席不炸**：取不到就记一笔、**下个 tick 再试**（插件加载早于服务注册是常态）。
6. **日志做"状态变化才记一笔"**：否则一个 tick 一行、日志刷成瀑布（我们真刷过）。
7. **异常自己吞**：绝不把异常抛回引擎（一个抛不出去的错能带走整台引擎）。
8. **一切可配**：根目录／间隔／署名／路径全部走 `config`，代码里不写死。
9. **带 `apiVersion`**：类型标识与信封格式都留版本位（"随时可扩充"是硬需求）。
10. **落盘原子**：写临时文件 ＋ `rename`（半截文件＝一次假死）。
11. **签名要覆盖全部语义字段**：漏签一个字段（比如 `mode`／优先级）＝ 别人能悄悄改写它（我们就是靠"`mode` 也进签名"堵住的）。
12. **幂等**：同一封信只消费一次（按消息 id 去重）；重放不许重复投递。
13. **默认离线**：要叫醒对方必须**显式** `online` —— 别让"默认在线"把别人的会话冲了。
14. **交件前**：**加载级自测** ＋ `selftest` 变绿 ＋ **真启一遍看日志无加载错** —— 语法过、模块级自测过，**都不算**（我们就是这么栽的：7 个入口全崩在同一行）。

## 六、常见故障
| 症状 | 多半是 | 处置 |
|---|---|---|
| 插件装了但"没反应" | 用了 `inject` ／ 顶层就取服务 | 改运行时取服务 ＋ 每 tick 重试 |
| **装了、`--dump-config` 也看得到层，但一真启就 `failed to apply`** | `apply()` 里**读了 `ctx.whale` 属性**（真 Cordis 里读它要先 `inject` ⇒ 抛 `cannot get property "whale" without inject`）；`--dump-config` 只组配置树、**不跑 `apply()`**，所以看不出来 | 只写 `ctx.provide('whale.xxx', x)` ＋ 运行时 `ctx.get('whale.xxx')`，**别碰 `ctx.whale` 属性**；验的时候**必须真启一遍**，`--dump-config` 不算（2026-10-10 六件全栽在这） |
| 改了代码没变化 | ESM 按 URL 缓存 ／ `file:` 装的是快照 | 重启引擎 ＋ 改 `link:` 装 |
| 引擎起不来、日志一行 `ReferenceError` | 常量没定义（我们真干过） | 跑加载级自测＋负向测试 |
| 收件人"没收到" | 对方**没有活体会话** | 正常：信**留在信箱里等人**，**不会丢** |
| 日志 4 秒一行 | 日志没做状态变化判断 | 见规范第 6 条 |

---

## 七、三个可配的行为（都不写就不启用，老部署行为一字不变）

这三条的名字**全部由配置给** —— 核心**不认识任何具体名字**（守 ACCEPTANCE 的"戊"）。

### 1）`offlineOnlyFlag` —— "只收离线"的成员

有些成员**根本收不到在线件**（比如只在你手边、不走常驻会话的那种）。给 `bus` 配一个**属性名**：

```yaml
- id: whale-bus
  name: dsh-whale-post-bus
  config:
    root: '~/.dsh/whale-mail'
    offlineOnlyFlag: '<你自己起的属性名>'      # ★名字随你起；核心不认识它
```

行为：对带该属性的成员**发在线 ⇒ 拒发**（退出码非 0 ＋ **不落信箱** ＋ 不许静默降级）文案**带出路**：
"请用 `--mode offline` 重发"。**`--force` 不豁免** —— 那是**物理约束**（它收不到在线件），不是"闸"。
发给一个**组**、组里有它 ⇒ **一样拦得住**。

### 2）`groupWithout` —— 群发默认不到谁

```yaml
- id: whale-roster-json
  name: dsh-whale-post-roster
  config:
    file: '~/.dsh/whale-mail/roster.json'
    groupWithout: '<你自己起的属性名>'          # ★群发时默认剔掉带此属性的成员
```

行为：**群发**（`--to all`、以及按组发）默认**剔掉**带该属性的成员；
**点名不受影响**（"**群发默认不到它，点名才进**"）。显式 `without: null` ⇒ 这一次不剔。
剔完组里没人 ⇒ **拒发**（不投一封没有收件人的信）。

### 3）成员属性的两种写法（任选）

```json
{ "apiVersion": 1,
  "members": [ { "id": "alice" },
               { "id": "carol", "<属性名>": true } ],   ← ① 写在成员上
  "groups": { "all": ["alice", "carol"] },
  "<属性名>": ["carol"] }                              ← ② 或者顶层同名数组
```

两种都认；假值（`false`／`0`／空串）一律算"**不带**"。
