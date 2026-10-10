/**
 * dsh-whale-post-bus —— 邮局核心：信封 / 摘要＋HMAC 签名 / 握手 / 幂等 / 落盘
 *
 * 接口：`ctx.whale.bus`（apiVersion 1）
 *   send(letter) / pump({ as, keep }) / verify(letter) / hello({ as })
 *
 * 三条设计（都写明了为什么）：
 *   1) **核心不认识任何名字与类型** —— 名单与类型一律从接口取（`ctx.whale.roster` / `ctx.whale.types`）；
 *      拿不到接口就退化成内置样例，绝不把名单写进核心。
 *   2) **默认离线** —— 离线＝信留在对方信箱里等人来收；在线＝立刻投出去（要叫醒对方）。
 *      取值写错一律**拒发**，不许悄悄降级（"急件写成 ONLINE 就永远叫不醒人"这种事故我们栽过）。
 *   3) **只投活体，不活就不投也不消费** —— 对方没有活体会话 ⇒ 信原样留在信箱里
 *      ⇒ **信只会晚到，不会不到**。
 *
 * 落盘：`<root>/inbox/<收件人>/<id>.msg.json`；`seen/` 已消费；`ack/` 回执；`state/` 状态与水位；
 *       `hello/` 握手；`退信/` 校验不过的信。写盘一律 **先 .tmp 再 rename**（原子）。
 */
import { createHmac, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, statSync, unlinkSync, openSync, closeSync } from 'node:fs'
import { join, dirname } from 'node:path'

export const name = 'whale-bus'
export const apiVersion = 1
export const V = 1
const FIELD_ORDER = ['v', 'kind', 'id', 'from', 'to', 'seq', 'subject', 'body', 'sha256', 'sentAtMs', 'type', 'mode', 're', 'hop', 'onlineCapPerDay', 'recv', 'quiet',
  // 结构化回执的字段（2026-10-10，设计文档"维护者 2026-10-06 01:5x 令"）——
  //   它们**必须进签名域**："一张回执说清两件事"是要**能验出改过**的。
  //   对老 ack **无影响** （canonical 只收**出现过的**字段）。
  'by', 'ok', 'note', 'recipientState', 'disposition', 'peerStateAtSend',
  // 发件人写下的"投递说明"（2026-10-10）—— 设计文档说"**`disposition` 优先取发件人写下的投递说明**"，
  //   而"**发件人写下的**"⇒ **它必须随信过去** （收信侧光看 `mode` 推不出"**为什么**走了离线"）。
  //   取值（本仓约定）：`'offline-only'`（对方声明仅收离线）／`'no-handshake'`（未握手 ⇒ 会留箱等人）。
  'deliveryNote']
/**
 * **已知但已废弃**的信封字段 （2026-10-10 从共享邮局根里真信上学到的）：
 *
 *   来源：班级里那套的**更晚决定**是"**桶分只看信封 `mode`，不看 `auth`** ⇒ **信封格式一字未改、老信与收端全兼容**"，
 *   ⚠️ 但 `auth`（`self`／`relay`／`authorized`）**在过渡期真被写进过信封** ⇒ 共享根里躺着三封这样的信。
 *
 *   为什么"放过它"是安全的：
 *     · 它**不进签名域** ⇒ **改它不影响签名** —— 这本来是危险信号；
 *     · 但**它现在没有任何语义**（那一套的桶分已经改用 `mode` 了）⇒ **改它也没用**；
 *     · **关键是：`seal()` 仍然拒它** ⇒ **新信里绝不许再出现**（没登记字段一律抛）。
 *
 *   所以这里的口径是：**旧信放行（当它是历史），新信照样 fail-closed**。
 *   ⚠️ 别的实现看到这个：**别照抄着往信封里加字段** —— 加字段必须同时进 `FIELD_ORDER`。
 */
const LEGACY_FIELDS = ['auth']
/** 认领文件留多少个（更老的自清）—— 与班级里设计文档同一个数 */
const SEQ_KEEP_CLAIMS = 300
/** 同步睡一会儿（`Atomics.wait` 是本进程内唯一可靠的同步 sleep）—— Windows `rename` 撞忙时要退避重试 */
const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } catch { /* 环境不支持就算了 */ } }

const DEFAULTS = {
  root: undefined,              // 信箱根（不传 ⇒ 环境变量 WHALE_POST_ROOT ⇒ 当前目录 .whale-mail）
  keyFile: undefined,           // 签名密钥文件（不传 ⇒ <root>/signing.key，首次用到时自动生成 32 字节）
  maxBody: 64 * 1024,           // 正文上限（字节）
  requireHello: true,           // 要不要握手（协议不许"像 UDP 那样"直接发）
  helloMaxAgeMs: 24 * 3600 * 1000,
  // 时钟容差（2026-10-10 按设计文档 S6h-④ 加）：`hello` 的 `sentAtMs` 比"现在"还晚多少以内**不算未来** 
  //   机器之间差几秒很常见；但**容差必须小** —— "未来"永远不该是"新鲜"的理由 （fail-safe 偏向离线）
  helloClockSkewMs: 60 * 1000,
  // 默认邮件类型：**这是配置**，不是写死在核心里的常量 —— 独立审计 2026-10-05 指出
  //   "核心不认识任何类型标识"与这里硬编码 `'direct'` 矛盾 ⇒ 挪进 config。
  //   配成 `null` ⇒ **不替调用方猜类型**：没显式给 type 的信直接被拒（宁可拒，不替人决定）。
  defaultType: 'direct',
    // "只收离线"的成员（2026-10-10 按**设计文档**改）：属性名**由配置给** ——
    //   核心不认识任何具体属性名（ACCEPTANCE 的"戊"）。**三态**：
    //     · 不配 ⇒ 这一条**完全不启用** （向后兼容）
    //     · 配成属性名 ⇒ **照发 ＋ 明示** （设计文档判据 58-62：**不再拒发** ——
    //       "叫不醒就留箱等人，但要大声说明"；**信封里的 `mode` 一字不改** —— 它在签名域里）
    //     · 要旧的"拒发" ⇒ 写 `offlineOnlyMode: 'reject'` （老部署一字不变）
    offlineOnlyFlag: undefined,
    // `'warn'`（默认）＝ 照发 ＋ 明示 ／ `'reject'` ＝ 旧的"拒发" 
    //   ⚠️ **模式单独一项** —— 第一版我把它塞进 `offlineOnlyFlag` 里（写 `'reject'` 当模式），
    //     结果核心去找"成员有没有叫 `reject` 的属性" ⇒ 找不到 ⇒ **根本不拦** （判据当场抓出来）。
    offlineOnlyMode: 'warn',
    // 被**明确**标成休眠的成员（2026-10-10 班级内口径移植）：属性名由配置给 ——
    //   核心不认识它；**不根据"多久没 hello"自己猜休眠** （那是猜，班级里明说"明确的 dormant 才退"）。
    //   配了它 ⇒ 对带该属性的成员**当场拒发**（非 0 ＋ 信不进它的信箱 ＋ 文案带出路）；
    //   只部分休眠（发给组）⇒ 只投给醒着的，并把剔掉谁如实带回去。不配 ⇒ 这一条完全不启用。
    dormantFlag: undefined,
}

const sha256 = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex')

/** 做一发邮局。config.services 可注入 roster／types／gate／deliver（测试与 CLI 用）。 */
export function createBus(config = {}) {
  const cfg = { ...DEFAULTS, ...config }
  const services = { ...(config.services ?? {}) }
  const probes = { ...(config.probes ?? {}) }        // sessionOf(id) 之类的外部探针

  const root = () => cfg.root ?? process.env.WHALE_POST_ROOT ?? join(process.cwd(), '.whale-mail')
  const paths = () => {
    const r = root()
    return {
      root: r,
      inbox: (w) => join(r, 'inbox', w),
      seen: (w) => join(r, 'seen', w),
      ack: (w) => join(r, 'ack', w),
      state: (w) => join(r, 'state', `${w}.json`),
      hello: (w) => join(r, 'hello', `${w}.json`),
      dead: join(r, '退信'),
      keyFile: cfg.keyFile ?? join(r, 'signing.key'),
    }
  }
  function ensure() {
    const p = paths()
    for (const d of [p.root, join(p.root, 'inbox'), join(p.root, 'seen'), join(p.root, 'ack'), join(p.root, 'state'), join(p.root, 'hello'), p.dead]) {
      mkdirSync(d, { recursive: true })
    }
  }
  /** 原子写：先写 .tmp 再 rename（半截文件＝一次假死，我们吃过这个亏） */
  function atomicWrite(file, text) {
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.tmp-${randomUUID().slice(0, 8)}`
    writeFileSync(tmp, text, 'utf8')
    // Windows 的 `rename` 会在"目标正被读／被杀软扫"时抛 EPERM／EBUSY ⇒ **退避重试，最后兜底直写** 
    //   班级里设计文档的记录：这是 **12 路压测抓出来的坑** —— 不是想出来的 （2026-10-10 移植）
    for (let i = 0; i < 6; i += 1) {
      try { renameSync(tmp, file); return file } catch (err) {
        const busy = err && (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES')
        if (!busy) throw err
        sleepSync(5 + i * 10)
      }
    }
    writeFileSync(file, text, 'utf8')       // 兜底：宁可少一次原子性，也不要发信失败 
    try { unlinkSync(tmp) } catch { /* 临时文件清不掉不是错 */ }
    return file
  }

  // ── 密钥与签名 ────────────────────────────────────────────────────────
  function keyHex() {
    const f = paths().keyFile
    if (existsSync(f)) {
      const t = readFileSync(f, 'utf8').trim()
      if (/^[0-9a-f]{64}$/i.test(t)) return t.toLowerCase()
    }
    const k = randomBytes(32).toString('hex')
    mkdirSync(dirname(f), { recursive: true })
    writeFileSync(f, k + '\n', { encoding: 'utf8', mode: 0o600 })
    return k
  }
  const canonical = (env) => JSON.stringify(FIELD_ORDER.filter((k) => env[k] !== undefined).map((k) => [k, env[k]]))
  const sign = (env) => createHmac('sha256', Buffer.from(keyHex(), 'hex')).update(canonical(env), 'utf8').digest('hex')
  /** fail-closed：没登记的字段一律不许封（否则"加字段忘了进签名域"＝那个字段可被随便改、验签照样过） */
  const seal = (fields) => {
    const unknown = Object.keys(fields).filter((k) => !FIELD_ORDER.includes(k) && k !== 'mac')
    if (unknown.length) {
      throw new Error(`seal() 收到没登记的字段：${unknown.join('、')} —— 请先把它加进 FIELD_ORDER（签名域＝信封的语义面）`)
    }
    const env = { ...fields }
    env.mac = sign(env)
    return env
  }
  const digest = (body) => sha256(body)
  function verify(env) {
    const e = []
    if (!env || typeof env !== 'object') return ['不是一封信（不是对象）']
    if (env.v !== V) e.push(`信封版本不认识：${env.v}（本工具只认 v=${V}）`)
    if (env.kind !== 'msg' && env.kind !== 'ack' && env.kind !== 'hello') e.push(`kind 取值非法：${env.kind}`)
    for (const k of ['id', 'from', 'to']) if (typeof env[k] !== 'string' || env[k] === '') e.push(`${k} 缺失或不是字符串`)
    if (typeof env.body !== 'string') e.push('body 缺失或不是字符串')
    else if (Buffer.byteLength(env.body, 'utf8') > cfg.maxBody) e.push(`正文超限（>${cfg.maxBody} 字节）`)
    if (typeof env.body === 'string' && env.kind === 'msg') {
      if (typeof env.sha256 !== 'string') e.push('sha256 缺失')
      else if (digest(env.body) !== env.sha256) e.push('正文摘要不符（内容被改过）')
    }
    if (env.mode !== undefined && !['online', 'offline'].includes(env.mode)) e.push(`mode 取值非法：${env.mode}（只能是 online／offline）`)
    if (env.re !== undefined && typeof env.re !== 'string') e.push('re 不是字符串（回环标记写坏）')
    if (env.hop !== undefined && (!Number.isInteger(env.hop) || env.hop < 1)) e.push('hop 不是正整数（回环标记写坏）')
    // 类型校验只问接口（核心不认识任何类型标识）
    if (env.type !== undefined && services.types && typeof services.types.resolve === 'function' && !services.types.resolve(env.type)) {
      e.push(`未注册的邮件类型：${env.type}`)
    }
    // 安全校验的**策略**归 `whale.verify` 包（"默认禁用"是维护者 2026-10-09 定的口径）：
    //   · 装了且**开启** ⇒ 先按它的判断（含白名单）；它放行 ⇒ 下面照旧做 HMAC（双保险，无害）
    //   · 装了但**禁用** ⇒ 它返回 `skipped` ⇒ 跳过 HMAC（这才让"默认禁用"真的生效）
    //   · **没装** ⇒ 照旧验签（向后兼容：老部署行为一个字不变）
    const vPolicy = services.verify
    const vRes = (vPolicy && typeof vPolicy.verify === 'function') ? vPolicy.verify(env) : null
    if (vRes && vRes.ok === false) e.push(`安全校验不过：${vRes.why}`)
    if (!(vRes && vRes.skipped)) {
      if (typeof env.mac === 'string') {
        const want = sign(env)
        const a = Buffer.from(env.mac, 'hex'); const b = Buffer.from(want, 'hex')
        if (a.length !== b.length || !timingSafeEqual(a, b)) e.push('MAC 不符（伪造，或密钥不同）')
      } else e.push('mac 缺失')
    }
    // fail-closed：不在签名域里的字段 ⇒ **拒**（否则"加字段忘了进 FIELD_ORDER"＝那个字段可被悄悄改）
    const known = new Set([...FIELD_ORDER, 'mac'])
    const unknown = Object.keys(env).filter((k) => !known.has(k) && !LEGACY_FIELDS.includes(k))
    if (unknown.length) e.push(`信封里有**没进签名域**的字段：${unknown.join('、')} —— 加字段必须同时加进 FIELD_ORDER`)
    return e
  }

  // ── 状态（发号水位 ＋ 已消费集合）────────────────────────────────────
  function loadState(as) {
    try {
      const s = JSON.parse(readFileSync(paths().state(as), 'utf8'))
      if (s && typeof s === 'object') return { nextSeq: 1, seen: [], recent: [], ...s }
    } catch { /* 没文件/读坏了 ⇒ 从零起 */ }
    return { as, nextSeq: 1, seen: [], recent: [] }
  }
  function saveState(as, s) {
    ensure()
    const disk = loadState(as)
    // `recent` 必须**去重合并**：原来直接拼接 ⇒ claimSeq 与收尾各存一次 ⇒ 每发一封信翻四倍
    //   （独立审计 2026-10-05 实测：#1=1 → #2=5 → #3=21 → #4=85 → #5=200 撞上限），
    //   而闸的"同对 N 分钟 M 封"正是数这个列表 ⇒ 第 5 封就被误拒。
    const rkey = (r) => `${r && r.to}|${r && r.atMs}|${(r && r.subject) ?? ''}`
    const seenKeys = new Set()
    const recent = [...(disk.recent ?? []), ...(s.recent ?? [])]
      .filter((r) => { const k = rkey(r); if (seenKeys.has(k)) return false; seenKeys.add(k); return true })
      .slice(-200)
    const merged = {
      as,
      nextSeq: Math.max(Number(disk.nextSeq ?? 1), Number(s.nextSeq ?? 1)),
      seen: [...new Set([...(disk.seen ?? []), ...(s.seen ?? [])])].slice(-2000),
      recent,
    }
    atomicWrite(paths().state(as), JSON.stringify(merged, null, 2))
    return merged
  }

  // ── 握手 ──────────────────────────────────────────────────────────────
  /**
   * 握手（可以带"自报"）—— `onlineCapPerDay` ＝ **这个成员自报的"每天最多收几封在线件"** 
   *   班级里 S8 的口径：**每封在线件 ＝ 叫醒一个成员做一次满上下文推理**（**最贵的那一步**）
   *   ⇒ 收件习惯**由它自己声明**，而**声明只能更保守** （闸那边取 `min(自报, 天花板)`）。
   *   它**进签名域** （"自报"也要能被验出改过）；不给 ⇒ **不进信封** ⇒ 老 hello 的签名照旧有效。
   *
   * `recv` ＝ **收件习惯的第二个声明位** （2026-10-10 补；设计文档《跨设备邮局-1.0局域网实现清单》
   *   附录三「收件习惯应由邮差自己声明」—— 那一份我 2026-10-10 才读到）：
   *   · `'offline-only'` ⇒ **对它发在线件 ⇒ 按"只收离线"办** （不拒发、**明示** —— 同
   *     `offlineOnlyFlag` 那一套）；
   *   · `'online-ok'` ⇒ **明确说"能被叫醒"** （今天**不改行为** —— 见下面的 ⚠️）；
   *   · **不给这个字段 ⇒ 什么都不变** （按名册／按老配置）。
   *   ⚠️ **设计文档附录三原话是"没有新鲜 hello ⇒ 按最保守：只许离线"** ——
   *     **而直接照做会误伤**：**班级内成员平时也可能没有新鲜 hello** 
   *     ⇒ "没有 ⇒ 只许离线"会把**班级内的在线件全拦掉** （今天没有任何一条判据这么要求）。
   *     ⇒ 这里**只做"显式声明"那一支**；"说不清就往保守倒"**留给手机那条线** 
   *     （那一条的真意是"**手机不在时本来就没有 hello ⇒ 天然只收离线**"，不是"改造班级内"）。
   *   设计文档还有两条护栏，**都已成立**：**声明只能更保守**（`min(自报, 天花板)`）／
   *     **假声明骗不了别人**（hello 是**它自己签的**）。
   */
  function hello({ as, onlineCapPerDay, recv, quiet } = {}) {
    if (!as) throw new Error('hello 需要 as')
    ensure()
    const cap = Number(onlineCapPerDay)
    const rc = recv === 'offline-only' || recv === 'online-ok' ? recv : null
    //   `quiet`：**两个 `HH:MM` 的数组** （格式不对 ⇒ **不进信封** —— 宁可不声明，不装一个坏的）
    const env = seal({
      v: V, kind: 'hello', id: `hello-${as}`, from: as, to: '*', seq: 0, body: '', sentAtMs: Date.now(),
      ...(Number.isFinite(cap) && cap >= 0 ? { onlineCapPerDay: Math.floor(cap) } : {}),
      ...(rc ? { recv: rc } : {}),
      ...(Array.isArray(quiet) && quiet.length === 2 && quiet.every((x) => typeof x === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x)) ? { quiet: [quiet[0], quiet[1]] } : {}),
    })
    atomicWrite(paths().hello(as), JSON.stringify(env, null, 2))
    return env
  }
  /**
   * 读某个成员**自己签的 hello** 里那份收件习惯（没有 ⇒ `null` —— **不替它猜**）
   *
   * ⚠️ 只认**新鲜**的 hello （过期的租约不算声明 —— 否则"一年前说过 offline-only"
   *   会**永久**生效）。`helloFresh` 是现成的。
   */
  function declaredRecv(as) {
    try {
      if (!helloFresh(as)) return null
      const env = JSON.parse(readFileSync(paths().hello(as), 'utf8'))
      const v = env.recv
      return v === 'offline-only' || v === 'online-ok' ? v : null
    } catch { return null }
  }
  /**
   * `quiet` ＝ **收件习惯的第三个声明位：勿扰时段** 
   *   （2026-10-10 补；设计文档附录三那句 `"quiet": ["22:00","09:00"]` —— **这是"峰谷令"的邮局版**）
   *
   *   **形状** （跟 `recv` 一样，只是它**有时段**）：`['22:00','09:00']` ＝ **从 22:00 到次日 09:00 别叫醒我**。
   *   **跨午夜要处理回绕** （`from > to` 是**正常**写法 —— 不是配置错）：
   *     · `from < to` ⇒ "当天的 `[from, to)`" （比如 `['12:00','14:00']` 午休）；
   *     · `from > to` ⇒ "**跨午夜**" （`'22:00'–'09:00'`）；
   *     · `from === to` ⇒ **空区间** （"全天勿扰"这种要显式说 —— 这里当**不静默**）。
   *   **只认新鲜 hello** （同 `recv` —— 否则"上周说过 22:00 起别吵"会**永久**生效）。
   *   ⚠️ 它**不是**"静默期不许发信" —— **离线件本来就不叫醒任何人** ⇒
   *     它管的**只有在线件**：静默时段内对它的在线件 ⇒ **按离线寄达 ＋ 明示** 
   *     （同 `recv: offline-only` 那一支 —— **信照落它那一格，只是不叫醒**）。
   */
  function declaredQuiet(as) {
    try {
      if (!helloFresh(as)) return null
      const env = JSON.parse(readFileSync(paths().hello(as), 'utf8'))
      const q = env.quiet
      if (!Array.isArray(q) || q.length !== 2) return null
      const ok = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
      if (!ok(q[0]) || !ok(q[1])) return null
      return { from: q[0], to: q[1] }
    } catch { return null }
  }
  /**
   * 某个成员**此刻**是否在自己的勿扰时段里 （没有声明 ⇒ **false** —— **不替它猜**）
   *   **用本地时间** （"22:00 别吵我"说的是**它自己的**钟点 —— 而这套邮局**本来就在一台机器上**；
   *     跨机器时这条要重新想 —— **已记进「仍未测」**）。
   */
  function inQuietHours(as, atMs = Date.now()) {
    const q = declaredQuiet(as)
    if (!q) return false                                       // 没声明 ⇒ 不静默 
    if (q.from === q.to) return false                          // 空区间 ⇒ 不静默 （"全天勿扰"要显式说）
    const d = new Date(atMs)
    const now = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    // 跨午夜 ⇒ 判"**在外面那一段**" （`22:00–09:00` ⇒ `now >= 22:00` **或** `now < 09:00`）
    return q.from < q.to ? (now >= q.from && now < q.to) : (now >= q.from || now < q.to)
  }
  /** 读某个成员**自己签的 hello** 里那份自报上限（没有 ⇒ `null` —— **不替它猜**） */
  function declaredOnlineCap(as) {
    try {
      const env = JSON.parse(readFileSync(paths().hello(as), 'utf8'))
      const v = Number(env.onlineCapPerDay)
      return Number.isFinite(v) && v >= 0 ? Math.floor(v) : null
    } catch { return null }
  }

  /**
   * 回执④：**拒收**（验签不过）（2026-10-10 从设计文档移植；设计文档判据 90）
   *   护栏（设计文档原话）："**坏信封（没 `from`／`id` ⇒ 连回执都不知道写给谁）绝不许把邮局搞崩**" 
   *   ⇒ **缺 `from`／`id` 就静默返回** （那封信本来就会被挪进退信，不必也不能回执）。
   *   ⚠️ 整段包在 `try` 里 —— 回执写不出去**绝不许**连累收信主流程。
   */
  function writeRefusal(as, env, why) {
    try {
      if (!as || !env || typeof env !== 'object' || !env.from || !env.id) return undefined
      const ackEnv = seal({ v: V, kind: 'ack', id: env.id, from: as, to: env.from, seq: env.seq ?? 0, body: '', sha256: '', sentAtMs: Date.now(), re: env.id,
        by: as, ok: false, note: `拒收：${String(why).slice(0, 200)}`, recipientState: meStateOf(as), disposition: 'refused' })
      atomicWrite(join(paths().ack(env.from), `${env.id}.${as}.ack.json`), JSON.stringify(ackEnv, null, 2))
      return ackEnv
    } catch { return undefined }
  }
  /** 我（收件人）此刻的状态："我在不在线"＝**我自己发出去的 `hello` 新不新鲜** */
  function meStateOf(as) {
    try {
      const h = JSON.parse(readFileSync(paths().hello(as), 'utf8'))
      const age = Date.now() - Number(h.sentAtMs ?? 0)
      const skew = Number(cfg.helloClockSkewMs) >= 0 ? Number(cfg.helloClockSkewMs) : 60000
      if (!Number.isFinite(age) || age < -skew) return 'offline'
      return age < cfg.helloMaxAgeMs ? 'online' : 'stale-online'
    } catch { return 'offline' }
  }
  /** 我"看到"的**别人**的状态（发信时写进信封，`peerStateAtSend`）（设计文档判据 99）——
   *   "发信人当时看到的状态"**只有发信人知道** ⇒ 只能**发信时写下来** （事后谁也推不出来）。 */
  function peerStateOf(id) {
    try {
      const h = JSON.parse(readFileSync(paths().hello(id), 'utf8'))
      const age = Date.now() - Number(h.sentAtMs ?? 0)
      const skew = Number(cfg.helloClockSkewMs) >= 0 ? Number(cfg.helloClockSkewMs) : 60000
      if (!Number.isFinite(age) || age < -skew) return 'offline'
      return age < cfg.helloMaxAgeMs ? 'online' : 'stale-online'
    } catch { return 'offline' }      // 没 hello ⇒ 从没见它报到过 ⇒ `offline` （不猜别的）
  }

  function helloFresh(as) {
    try {
      const env = JSON.parse(readFileSync(paths().hello(as), 'utf8'))
      if (verify(env).length) return false
      const age = Date.now() - Number(env.sentAtMs ?? 0)
      // 未来时间戳 ⇒ **判不新鲜** （2026-10-10 按设计文档 S6h-④ 加）
      //   病：原来是 `Date.now() - sentAtMs < 上限` ⇒ **未来的 `sentAtMs` 差值是负数**
      //     ⇒ 永远"新鲜" ⇒ **伪造一个 2099 年的 hello 就能让握手闸形同虚设** 
      //   fail-safe 口径（设计文档原话）："**误判只许偏向离线**" 
      //     —— 宁可把"刚报到"当成"没报到"（信留在箱里等人），
      //        也**不许把"没报到"当成"刚报到"**（那会让信**投不进去**）。
      //   ⚠️ 留一点**时钟容差**（默认 60 秒、可配）—— 机器之间差几秒很常见，
      //     但容差必须小："未来"永远不该是"新鲜"的理由。
      const skew = Number(cfg.helloClockSkewMs) >= 0 ? Number(cfg.helloClockSkewMs) : 60000
      if (!Number.isFinite(age) || age < -skew) return false
      return age < cfg.helloMaxAgeMs
    } catch { return false }
  }

  // 组员名单（给闸算"一个组算 1 单位"用）：roster 有 group() 才有；没有就返回 undefined（⇒ 逐人计）
  //   ⚠️ 这段必须在**核心**里做 —— 闸不认识名字，只认"这些人是同一组"这件事
  function groupMembersOf(to) {
    const R = services.roster
    const g = R && typeof R.group === 'function' ? R.group(to) : undefined
    return Array.isArray(g) && g.length ? g.map(String) : undefined
  }
  // ── 收件人解析（只问 roster 接口，核心不认识名字）─────────────────────
  function resolveTargets(to, { as, force }) {
    const roster = services.roster
    if (!to || typeof to !== 'string') throw new Error('收件人（to）必须是字符串')
    const R = roster
    const has = (id) => (R && typeof R.has === 'function' ? R.has(id) : false)
    const list = () => (R && typeof R.list === 'function' ? R.list().map((m) => String(m.id ?? m)) : [])
    // 组名：roster 可选扩展 group(name) ⇒ 没有就当"人名"处理
    const g = R && typeof R.group === 'function' ? R.group(to) : undefined
    // 群发清单（2026-10-10）：优先问 `roster.broadcast()` —— 它按配置剔掉"不该群发的人"，
    //   而**核心不认识那个属性名**；没有这个接口 ⇒ 退回完整名单（向后兼容：老部署行为一字不变）
    const all = (R && typeof R.broadcast === 'function' ? R.broadcast().map(String) : list()).filter((id) => id !== as)
    if (to === 'all') return all
    if (g) {
      // 组员必须**在名单里**才投（独立审计 2026-10-05：原来"幽灵组员"也能收到信 ⇒ 会往名单外的信箱写文件）
      const known = g.map(String).filter((id) => has(id) && id !== as)
      if (known.length === 0) throw new Error(`组「${to}」里没有已知成员（组员必须先出现在名单里）—— 不往名单外的信箱投信`)
      return known
    }
    if (has(to)) return [to]
    if (as === to) throw new Error(`不能给自己发信（${to}）—— 自己给自己写笔记不必过邮局`)
    if (force) return [to]                      // --force 只豁免"没握过手"，不豁免"名字写错"
    const rf = services.roster && services.roster.file ? services.roster.file : '(未知)'
    const there = rf !== '(未知)' && existsSync(rf)
    throw new Error(`未知收件人：${to} —— 【组名】要 roster 里有定义；【人名】要已在名单里。` +
      `（名单文件：${rf} —— 当前${there ? '存在' : '不存在'}；--force 只豁免握手，不豁免名字。）`)
  }

  // ── 发信 ──────────────────────────────────────────────────────────────
  // ── 发号（认领式 ＋ 水位线 —— 2026-10-10 从班级里设计文档移植）─────────────────
  const stateDir = () => join(paths().root, 'state')
  const claimPath = (as, n) => join(stateDir(), `${as}.seq.${String(n).padStart(6, '0')}`)
  const watermarkPath = (as) => join(stateDir(), `${as}.seq`)
  function readWatermark(as) {
    try {
      const n = Number(String(readFileSync(watermarkPath(as), 'utf8')).trim())
      return Number.isInteger(n) && n > 0 ? n : 0
    } catch { return 0 }
  }
  /**
   * 水位线写作：**只增不减** （2026-10-10 修，`racetest` 偶发抓出来的）
   *
   * **病**：原来是无条件 `atomicWrite(watermarkPath, n)` ——
   *   而 12 路并发时，**最后写的那个进程，可能是先发号的那个** ⇒ 它把它那个**小的** `n` 写上去
   *   ⇒ **水位线倒退** （实测现场：`水位线=11 最大号=12`）。
   * **后果到哪为止**：`seq` **唯一性靠的是"认领文件"** （`openSync(...,'wx')` 原子创建）
   *   ⇒ **那份保护不受影响** （同一轮 `seq 全唯一` 那条**一直是 PASS**）；
   *   受影响的只是**水位线这条兜底** （"state 被写倒退时，靠它拿新号"）——
   *   而兜底**倒退** ⇒ 退回到"用 state 那个（已倒退的）值"⇒ **可能重号** （这才是真风险）。
   * **方**：写之前**先读一眼**，**只在更大的时候写** ⇒
   *   最坏情况从"**写小了**"变成"**少写一次**" （少写一次没关系：下一个发到更大号的人会补上）。
   * ⚠️ "读-比较-写"**本身也不是原子的** —— 但它的最坏结果**只是少写** （不会写小），
   *   而"少写"会被**任何一次后续发号**修好。
   */
  function writeWatermark(as, n) {
    try {
      const cur = readWatermark(as)
      if (Number.isFinite(n) && n > cur) atomicWrite(watermarkPath(as), `${n}\n`)
    } catch { /* 写不上也不该拦住发信 */ }
  }
  /** 清掉比 `n - SEQ_KEEP_CLAIMS` 更老的认领文件（best-effort） */
  function pruneClaims(as, n) {
    const cut = n - SEQ_KEEP_CLAIMS
    if (cut <= 0) return
    try {
      for (const f of readdirSync(stateDir())) {
        const m = /^(.+)\.seq\.(\d{6})$/.exec(f)
        if (!m || m[1] !== as) continue
        if (Number(m[2]) < cut) { try { unlinkSync(join(stateDir(), f)) } catch { /* 别人正在用就算了 */ } }
      }
    } catch { /* 清不掉不是错 */ }
  }
  /**
   * 认领式发号 （根因①「同身份并发 ⇒ 同号」的根治）——
   *   病：原来是"读 `nextSeq` → 加一 → 写回"，**两个进程都读到 N 就都发 N**。
   *   班级里**第一版用独占锁 —— 24 路压测过、48 路压测 9 组撞号** ⇒ 弃用锁，改认领式。
   *   法：从 `max(state.nextSeq, 水位线+1)` 起逐个试，**用 `openSync(...,'wx')` 原子创建认领文件**，
   *       **谁建成功谁得号** ⇒ **不排队、不等待、不超时失败、不可能同号** （这正是"锁"栽掉的地方）。
   *   ⚠️ `EPERM／EBUSY／EACCES` 也当"被占" —— Windows 上"正被删"的认领文件会这么报。
   */
  function claimSeq(as) {
    const s = loadState(as)
    let n = Math.max(Number(s.nextSeq) || 1, readWatermark(as) + 1)
    for (let i = 0; i < 100000; i += 1, n += 1) {
      try {
        closeSync(openSync(claimPath(as, n), 'wx'))
        writeWatermark(as, n)
        if (n % 25 === 0) pruneClaims(as, n)     // 摊着清：每 25 个号清一次 
        s.nextSeq = n + 1
        saveState(as, s)
        return n
      } catch (error) {
        const taken = error && (error.code === 'EEXIST' || error.code === 'EPERM' || error.code === 'EBUSY' || error.code === 'EACCES')
        if (!taken) throw error
      }
    }
    throw new Error('seq 认领失败：连试 10 万个号都被占（state 目录里怕是堆了异常多的认领文件）')
  }
  function send(letter = {}) {
    ensure()
    const { as, to, subject = '', body, mode, type: typeIn, re, force = false } = letter
    // 类型：显式给 ⇒ 用它；没给 ⇒ 用配置里的默认（默认也配成 null ⇒ **拒发**，不替调用方猜）
    const type = typeIn ?? cfg.defaultType
    if (type === undefined || type === null || type === '') {
      throw new Error('这封信没写类型，而本邮局没有配默认类型（`defaultType: null`）—— 请显式给一个已注册的类型，或把默认类型配进 config')
    }
    if (!as) throw new Error('send 需要 as（发件人）')
    if (String(body ?? '').trim() === '') {
      throw new Error('正文为空 —— 拒发。空信封会被投递成功（收端只看到空壳）；请检查正文参数是否指到了空文件。')
    }
    const m = (mode === undefined || mode === null || mode === '') ? 'offline' : String(mode)
    if (!['online', 'offline'].includes(m)) {
      throw new Error(`mode 取值非法：${mode}（只能是 online／offline；不传 ＝ 默认 offline）`)
    }
    if (services.types && typeof services.types.resolve === 'function' && !services.types.resolve(type)) {
      throw new Error(`未注册的邮件类型：${type}（先用 types.register('${type}', { … }) 注册）`)
    }
    let targets = resolveTargets(to, { as, force })
    let skippedDormant = []          // 被明确标成休眠、因此**没投**的收件人（如实带回去）
    if (targets.length === 0) throw new Error(`收件人算出来是空的（to=${to}）—— 别发没有收件人的信`)
    // "只收离线"的成员（2026-10-10 按**设计文档**改：**照发 ＋ 明示**，不再拒发）——
    //   设计文档判据 58-62 ＋「维护者 2026-10-06 令」：**"（B 分支）对只收离线者发在线 ⇒ 照发"**，
    //     且**"明示「只收离线 ⇒ 已按离线处理」"** （**不许静默**）。
    //   ⚠️ **`mode` 一字不改** —— **它在签名域里** ⇒ "偷偷改成离线"会**破签**；
    //     所以只能"**照发（仍是 online）＋ 明示'对它们而言会按离线处理'**"。
    //   **三态**（跟 `requireHello` 同一个模式）：属性名不配 ⇒ 不启用；
    //     配了（真值）⇒ **照发 ＋ 明示**；**配成 `'reject'` ⇒ 保留旧的"拒发"** （老部署一字不变）。
    //   ⚠️ 用**展开后的 targets** ⇒ 发给一个组、组里有人只收离线，也一样能明示出来。
    let offlineOnly = []
    //   `fromQuietNow` 必须在**这一层**声明 （2026-10-10 修）——
    //     我第一版把它写在 `if (m === 'online') { … }` **里面** ⇒ 出了那个块就**看不见了** 
    //     ⇒ `ReferenceError: fromQuietNow is not defined` （而**写 `deliveryNote` 的地方在块外面**）。
    //   ⚠️ 又是"**声明的作用域**"这类错 —— **语法检查看不出来**，只有真跑才炸。
    let fromQuietNow = []
    if (m === 'online') {
      //   判据有**两个来源** （2026-10-10 补；设计文档附录三）：
      //     · **名册钉死位**（`offlineOnlyFlag` —— 老配置照旧管用）；
      //     · **它自己签的 hello 里的 `recv: 'offline-only'`** （"收件习惯由邮差自己声明"）。
      //   **并集** —— 声明能**扩大**保护面，而**不缩小** （名册说它只收离线 ⇒ 声明说 online-ok 也不算数 
      //     —— "声明只能更保守"）。
      const fromRoster = (cfg.offlineOnlyFlag && services.roster && typeof services.roster.flag === 'function')
        ? targets.filter((t) => services.roster.flag(t, cfg.offlineOnlyFlag))
        : []
      const fromDecl = targets.filter((t) => declaredRecv(t) === 'offline-only')
      //   **勿扰时段**（`quiet`）—— 它跟 `recv: 'offline-only'` **同一形状**：
      //     **不拒发、只明示** （信照落它那一格，**只是现在不叫醒**）。
      //   用**本地时间** （这套邮局本来就在一台机器上）。
      const fromQuiet = targets.filter((t) => inQuietHours(t))
      const stuck = [...new Set([...fromRoster, ...fromDecl, ...fromQuiet])]
      //   `fromQuiet` 单独留一份 （后面写 `deliveryNote` 要用）
      fromQuietNow = fromQuiet
      if (stuck.length) {
        if (cfg.offlineOnlyMode === 'reject') {
          throw new Error(`拒发：${stuck.join('、')} 只收离线件（配置 offlineOnlyFlag='${cfg.offlineOnlyFlag}' ＋ offlineOnlyMode='reject'）—— ` +
            `请用 --mode offline 重发。这不是故障，--force 也不豁免：它们收不到在线件。`)
        }
        offlineOnly = stuck     // 不拒发 —— 只**明示**出来 （信照落它们那一格）
      }
    }
    // 被**明确**标成休眠的成员（2026-10-10 班级内口径移植：**明确的 `dormant` 才退，不猜**）——
    //   属性名由配置给（`dormantFlag`），核心不认识它。
    //   **不许根据"多久没 hello"自己猜休眠** —— 那是猜；**必须有明确标记**。
    //   对它们发信 ⇒ **当场拒发**（非 0 ＋ 信**不进它的信箱** ＋ 文案带出路）——
    //   否则信会**永远堆在一个不会有人来的信箱里**，而发信人还以为发成功了。
    //   部分休眠 ⇒ 只投给醒着的，并把"剔掉了谁"**如实带回去** （不许静默）。
    if (cfg.dormantFlag && services.roster && typeof services.roster.flag === 'function') {
      const asleep = targets.filter((t) => services.roster.flag(t, cfg.dormantFlag))
      if (asleep.length) {
        targets = targets.filter((t) => !asleep.includes(t))
        skippedDormant = asleep
      }
    }
    // 握手（2026-10-10 按设计文档改：**未握手不再拒发** —— 设计文档判据 1-3 ＋「**维护者 2026-10-06 01:5x 令**」）
    //   为什么改："拒发"是**更早**的版本；新口径是 **照发 ＋ 大声说明"对它们降级为离线"**。
    //   理由正是"**信只会晚到，不会不到**"：叫不醒 ⇒ 就**留在箱里等人**；
    //     而"拒发"是**反的** —— 信**根本没出去**，发信人还以为"协议不让发"。
    //   三态（老部署写 `'reject'` ⇒ **一字不变**）：
    //     · `false`       ⇒ **不检查**握手（也不明示）
    //     · `'reject'`    ⇒ **旧的"拒发"** （保留给要旧行为的人）
    //     · 其它真值（默认 `true`）⇒ **照发 ＋ 明示降级** 
    //   ⚠️ 本封是**离线件**时**根本不看握手** （离线件躺着等人，握手管不着它）
    let willWait = []
    if (m !== 'offline' && cfg.requireHello && !force) {
      const missing = targets.filter((t) => !helloFresh(t))
      if (missing.length) {
        if (cfg.requireHello === 'reject') {
          throw new Error(`未与 ${missing.join('、')} 建立握手（对方没有新鲜的 hello，或已过期）—— ` +
            `协议不许"像 UDP 那样"直接发。让对方先跑 hello；确需强发用 --force（收信侧只认签名与摘要、不看握手，会照收）。`)
        }
        // 新口径：**照发**，但把"这些人叫不醒、信会留在箱里等"**明示**出来 （不许静默）
        willWait = missing
      }
    }
    // 闸：只问接口（闸可以拒，也可以记账）—— 把它判断需要的东西都给出去（含 force／链深／组员名单）
    //   ⚠️ `groupMembers` 必须由**核心**解析后传下去：闸不认识名字，它只知道"这些人算一个组"
    const hop0 = (re === undefined || re === '') ? undefined : hopOf(re)
    const groupMembers = groupMembersOf(to)
    const gate = services.gate
    if (gate && typeof gate.check === 'function') {
      // S8：把"每个收件人**自报**的在线件上限"交给闸 （闸不认识 `hello/`，也读不了盘）
      //   同时把 **`roster` 接口转发**过去 —— "谁算手机"要靠名单判，而**属性名在闸的配置里**；
      //   核心**只是转发接口**，它自己仍然**不认识任何名字**。
      const declaredCaps = {}
      for (const t of targets) { const c = declaredOnlineCap(t); if (c !== null) declaredCaps[t] = c }
      const r = gate.check({ as, to, targets, subject, body, mode: m, type, re, force, hop: hop0, groupMembers },
        { declaredCaps, roster: services.roster })
      if (r && typeof r === 'object' && r.reject) throw new Error(`闸拒发：${r.reason}`)
    }
    // 发号放在**闸之后**（独立审计 2026-10-05）：被拒的信不该烧掉一个序号 ⇒ 水位与真实发信量对得上
    const seq = claimSeq(as)
    const id = `${Date.now().toString(36)}-${as}-${String(seq).padStart(4, '0')}-${randomUUID().slice(0, 8)}`
    const hop = hop0
    const env = seal({ v: V, kind: 'msg', id, from: as, to, seq, subject, body, sha256: digest(body), sentAtMs: Date.now(), type, mode: m,
      // "投递说明"随信过去 （收信侧才知道"**为什么**走了离线"）——
      //   `offlineOnly`（对方声明仅收离线）优先于 `willWait`（未握手）：前者是**对方的属性**，更根本。
      //   `quiet` 单独一档：它不是“只收离线”（对方本来是能被叫醒的）——
      //     只是**现在是它的勿扰时段** ⇒ 分开说，下一个人才知道该怎么办。
      ...(offlineOnly.length ? { deliveryNote: 'offline-only' } : (fromQuietNow.length ? { deliveryNote: 'quiet-hours' } : (willWait.length ? { deliveryNote: 'no-handshake' } : {}))),
      // `peerStateAtSend` （设计文档判据 99：回执带上「**发信人当时看到的状态**」）——
      //   「当时看到什么」**只有发信人能记** （事后谁也推不出来）⇒ **发信时就写进信封**。
      //   只看**点名一个**收件人的场合（`targets.length === 1`）—— 群发时不写它：
      //     「我看到的状态」对不同人**不一样**，只写一个会**误导** （要写就得分人，那是下一版的事）。
      ...(targets.length === 1 ? { peerStateAtSend: peerStateOf(targets[0]) } : {}),
      ...(hop === undefined ? {} : { re, hop }) })
    // S11：收件人**全休眠** ⇒ **退信** （2026-10-10 从设计文档移植；设计文档判据 100-104 ＋「维护者 2026-10-06 02:5x 令」）
    //   五条口径：① **不落它信箱** （它不会有人来取 ⇒ 落进去就是永远堆着）
    //     ② **进班级里 `退信/`** （**没删** —— 发信人还能找回来）
    //     ③ **留说明** （写明"此人无法收到邮件"）④ **结果里明示** （**不许静默**）
    //     ⑤ **不占配额** —— 因为这里**在 `gate.record` 之前就返回** （与"被闸拦下的不占额度"同一条）
    //   ⚠️ 放在 `seal()` **之后** —— 退信也要有个 `id` （好让人按号找）；
    //     而放在**投递与记账之前** ⇒ 自然"不落它信箱 ＋ 不占配额"。
    if (targets.length === 0 && skippedDormant.length) {
      const deadDir = paths().dead
      mkdirSync(deadDir, { recursive: true })
      atomicWrite(join(deadDir, `${id}.msg.json`), JSON.stringify(env, null, 2))
      atomicWrite(join(deadDir, `${id}.why.txt`),
        `退回原因：收件人${skippedDormant.join('、')}无法收到邮件（被明确标成休眠，配置 dormantFlag='${cfg.dormantFlag}'）。\n` +
        `这封信**没有**投进任何人的信箱，也**没有**占配额；它留在这里等你看。\n` +
        `换个人发，或先让它醒（把名单里那个标记去掉再发）。\n` +
        `发件人：${as}　主题：${subject || '（无）'}　时间：${new Date(env.sentAtMs).toISOString()}\n`)
      return { id, seq, to, targets: [], mode: m, type, verdict: 'bounced', hop, env,
        skippedDormant, bounced: skippedDormant }
    }
    for (const t of targets) atomicWrite(join(paths().inbox(t), `${id}.msg.json`), JSON.stringify(env, null, 2))
    // 投递策略：只问接口（核心不认识"会话"）
    let verdict = m === 'online' ? 'delivered' : 'kept'
    if (services.deliver && typeof services.deliver.deliver === 'function') {
      verdict = services.deliver.deliver(env, { bus: api, probes, targets }) ?? verdict
    }
    if (gate && typeof gate.record === 'function') gate.record({ ...env, as: env.from, groupMembers }, targets)
    const st = loadState(as)
    st.recent = [...(st.recent ?? []), { to, atMs: env.sentAtMs, subject: String(subject).slice(0, 40) }].slice(-200)
    saveState(as, st)
    return { id, seq, to, targets, mode: m, type, verdict, hop, env,
      ...(skippedDormant.length ? { skippedDormant } : {}),
      // 设计文档同名：`wakePrediction.willWait` ＝ **"这些人叫不醒，信会留在箱里等"** （不许静默）
      //   `offlineOnly` ＝ **"这些人只收离线 ⇒ 这封在线件对它们而言会按离线处理"** 
      //   （但**信封里的 `mode` 一字不改** —— 它在签名域里）
      ...((willWait.length || offlineOnly.length)
        ? { wakePrediction: { ...(willWait.length ? { willWait } : {}), ...(offlineOnly.length ? { offlineOnly } : {}) } }
        : {}) }
  }
  // 回环链深：数一数这封信是本链第几跳（父信读不到 ⇒ 当第 1 跳，不冤枉人）
  function hopOf(parentId) {
    for (const w of relayDirs('seen')) {
      try {
        const env = JSON.parse(readFileSync(join(paths().seen(w), `${parentId}.msg.json`), 'utf8'))
        return (Number.isInteger(env.hop) ? env.hop : 1) + 1
      } catch { /* 换下一个信箱找 */ }
    }
    return 1
  }
  function relayDirs(kind) {
    try { return readdirSync(join(paths().root, kind)) } catch { return [] }
  }

  // ── 收信（"不投也不消费"必须在**收信侧**落实 —— 发信侧的判定拦不住收信侧）──
  //   keep 四种形态：
  //     · 不传（默认）⇒ **没有读者就不消费**：收信人此刻没有活体会话、也没给 `inject`／`reader`
  //       ⇒ 信**原样留在 `inbox/`**（不搬 seen、不删原件、不写 ack）⇒ **信只会晚到，不会不到**
  //     · `keep: true` ⇒ 全都不消费（只看一眼）
  //     · `keep: false` ⇒ **显式**要求消费（调用方自己保证读得到）
  //     · `keep: (env) => boolean` ⇒ 逐封判（和我们线上邮差插件的写法一致）
  //   `reader: true` ＝ "我就是那个读者，我自己负责把信交出去"（例如 CLI 把信打进终端）
  //   `inject: (env) => void` ＝ **真的注入回调**（独立复核 2026-10-05 指出"名不副实"后改的）：
  //     给了它，`pump` 就**真的**把信交给它；**它抛异常 ⇒ 不消费**（信原样留着）
  //     —— 与 `deliver` 里那条保命规则同一条：**交不出去的信，绝不许当成交出去了**。
  //   ⚠️ **光有"活体会话"不构成消费理由** —— 会话活着，不等于信交到了读者手里。
  function pump({ as, keep, reader = false, inject } = {}) {
    ensure()
    if (!as) throw new Error('pump 需要 as（收件人）')
    const hasInject = typeof inject === 'function'
    const sessionOf = probes.sessionOf ?? services.deliver?.sessionOf
    const liveNow = () => {
      try { const s = typeof sessionOf === 'function' ? sessionOf(as) : undefined; return !!(s && s.live) } catch { return false }
    }
    const canRead = reader === true || hasInject
    // **勿扰时段：`quiet` 的"另一半"** （2026-10-10 补）——
    //   **病**：`quiet` 原来只在 **`send` 侧**生效 （"别人发在线件时不叫醒我"）——
    //     **而**收信侧**（`pump` 把信消费掉、交到读者手里）**完全不看它**** 
    //     ⇒ **"勿扰"只有一半**：**人家不叫醒我，可我自己醒来时照样把信都读了**。
    //   **正解**：**若我声明了 `quiet` 且**此刻就在窗口内** ⇒ 即使有读者，也**留着** ——
    //     **理由跟 `keep` 一样**：**信一直在信箱里** （"**只会晚到，不会不到**"），
    //     **而"勿扰"的意思本来就是"**这会儿连我自己也不处理**"**。
    //   ⚠️ **它不是"拒收"** —— **只是"这一轮不读"**；窗口一过，`pump` 照旧读。
    //   ⚠️ **`keep: false` 仍然优先** （显式命令"我就是要现在读" ⇒ **它说了算**）。
    const quietNow = (() => { try { return inQuietHours(as) } catch { return false } })()
    const keepThis = (env) => {
      if (keep === true) return true
      if (keep === false) return false                    // 显式"现在就读" ⇒ 它说了算 （勿扰也不拦）
      if (typeof keep === 'function') return !!keep(env)
      if (quietNow) return true                           // 勿扰时段 ⇒ 留着（"这会儿连我自己也不处理"）
      return !canRead                                     // 默认：没有读者 ⇒ 不消费
    }
    const dir = paths().inbox(as)
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.msg.json')).sort() : []
    const out = []
    // 校验不过的信要不要**挪进退信**，看**这一整次调用**的意图 （2026-10-10 修的）：
    //   `keep: true`（只看一眼）／`keep` 是函数／**没有读者** ⇒ **不消费** ⇒ **只报不移** 
    //   不这样就会**违反 keep 自己的承诺**：`pump --keep` 号称"只看不消费"，却把文件挪走了 
    //   （这是实测踩出来的：我在共享邮局根上用 `--keep` 只想看一眼，三封信当场被挪进退信）
    const willConsume = (keep === false) ? true : ((keep === true || typeof keep === 'function') ? false : canRead)
    const moveDead = (f, text) => {
      if (!willConsume) return '（keep：没动它）'
      atomicWrite(join(paths().dead, f), text)
      unlinkSync(join(dir, f))
      return ' ⇒ 已挪进"退信"'
    }
    for (const f of files) {
      const p = join(dir, f)
      let env
      try { env = JSON.parse(readFileSync(p, 'utf8')) } catch (err) {
        out.push({ ok: false, file: f, why: `读不成信（${err.message}）` + moveDead(f, readFileSync(p, 'utf8')) })
        continue
      }
      const probs = verify(env)
      if (probs.length) {
        // 回执④：**拒收**（验签不过）⇒ 写一份 `ok:false` ＋ `disposition:'refused'` 
        //   （2026-10-10 从设计文档移植；"维护者 2026-10-06 01:5x 令"＋设计文档判据 90）
        //   为什么该写：不写的话**发信人永远等不到回执** —— 它会一直以为"信在路上"。
        //   设计文档那条护栏的另一半："**坏信封（没 `from`／`id` ⇒ 连回执都不知道写给谁）
        //     绝不许把邮局搞崩 ⇒ 直接不写回执**" ⇒ **反过来：只要 `from`／`id` 在，就该写一份**。
        //   ⚠️ 信封可能是**坏 JSON**（上面已 `continue`）或**验签不过但结构可读** ⇒ 这里只碰后者。
        writeRefusal(as, env, probs.join('；'))
        out.push({ ok: false, file: f, id: env.id, why: probs.join('；') + moveDead(f, JSON.stringify(env, null, 2)) })
        continue
      }
      // 只处理"信"（独立审计 2026-10-05：hello／ack 信封原来会被当普通信消费）
      if (env.kind !== 'msg') {
        out.push({ ok: false, file: f, id: env.id, why: `这不是一封信（kind=${env.kind}）` + moveDead(f, JSON.stringify(env, null, 2)) })
        continue
      }
      // 收件人核对（独立审计 2026-10-05：原来不看 `to` ⇒ 别人掉进我信箱的信会被我消费并回执）
      //   认两种：直接点名我；发给"我所属的组"。**没有 roster 接口时跳过**（认不了组，不冤枉信）
      const rosterHasGroup = services.roster && typeof services.roster.group === 'function'
      const memberOfGroup = rosterHasGroup ? services.roster.group(env.to) : undefined
      const isMine = env.to === as || (Array.isArray(memberOfGroup) && memberOfGroup.includes(as))
      if (!isMine && rosterHasGroup) {
        out.push({ ok: false, file: f, id: env.id, why: `这封信不是给你的（to=${env.to}）` + moveDead(f, JSON.stringify(env, null, 2)) })
        continue
      }
      const st = loadState(as)
      // 幂等：`seen/` 目录**本身就是永久证据**（状态数组会被截断/丢）—— 两边都认
      //   （独立审计 2026-10-05：只靠 `seen` 数组 ⇒ 重投同一封就会二次交付）
      const dup = (st.seen ?? []).includes(env.id) || existsSync(join(paths().seen(as), f))
      const mode = env.mode ?? 'online'                    // 老信没有 mode ⇒ 按"在线"（不把旧信闷死）
      const label = env.mode === undefined ? '[旧信·未标模式]' : (mode === 'offline' ? '[离线]' : '[在线]')
      const row = {
        ok: true, file: f, id: env.id, from: env.from, subject: env.subject, body: env.body,
        mode, dup, handled: `${label} ${env.from} → ${as}：《${env.subject ?? ''}》`,
      }
      if (keepThis(env)) {
        out.push({
          ...row, kept: true,
          //   **理由要**说真话**** （2026-10-10 修 —— 而这是**我自己刚写的代码在说错话**）：
          //     **病**：我把"勿扰时段把信留下"也套进了"**没有读者**"那一句 ⇒
          //       **而实际上**有读者**（`reader: true`）—— **理由跟事实不符**。
          //     **四种"留着"各有各的理由**：`keep: true`（只看不消费）／
          //       **勿扰时段**（"这会儿连我自己也不处理"）／`keep` 函数说留 ／**真的没有读者**。
          why: keep === true ? 'keep=true：只看不消费'
            : quietNow ? `**勿扰时段**（它自己用 \`quiet\` 声明的 ⇒ **这会儿连它自己也不处理**）⇒ 不投也不消费，原样留在信箱里（窗口一过照读）`
              : `没有读者（没给 inject、也没声明 reader${liveNow() ? '；**有活体会话也不算**：会话活着不等于信交到了读者手里' : ''}）⇒ 不投也不消费，原样留在信箱里`,
        })
        continue
      }
      // 真注入（独立复核指出 `inject` 原本"名不副实"）：**交到读者手里才算数**；
      //   抛异常 ⇒ **不消费** —— 信原样留着，下次再来（不制造"偶发丢信"）
      if (hasInject) {
        try {
          inject(env)
        } catch (err) {
          const msg = String(err && err.message ? err.message : err)
          out.push({ ...row, kept: true, injectError: msg, why: `注入抛异常 ⇒ **不消费**（信留在信箱里，没搬 seen、没写 ack）：${msg}` })
          continue
        }
      }
      atomicWrite(join(paths().seen(as), f), JSON.stringify(env, null, 2))
      unlinkSync(p)
      if (!dup) {
        // 结构化回执（2026-10-10 从设计文档移植；"维护者 2026-10-06 01:5x 令"＋设计文档判据 87-90）——
        //   一张回执说清**两件事**：
        //     ① `recipientState`：**我（收件人）当时的状态** —— `online`／`stale-online`／`offline`
        //        （"我在不在线"＝**我自己发出去的 `hello` 新不新鲜** —— 收信侧能自己算）
        //     ② `disposition`：这封信的**去向** ——
        //        `refused`（拒收）／`accepted-online`（在线签收）／
        //        `delivered-offline-by-declaration`（**因发件人说过"对方仅收离线"** ⇒ 按离线寄达）／
        //        `delivered-offline-by-stale`（**因在线声明过期** ⇒ 降级为离线寄达）／
        //        `delivered-offline`（本来就是离线件）
        //   `disposition` **优先取发件人写下的投递说明** （"那才是**当时怎么判的**"——
        //      收信侧自己推的话，只能推出"这封信是离线的"，推不出"**为什么**走了离线"）。
        //   护栏 （设计文档原话）："**坏信封（没 `from`／`id` ⇒ 连回执都不知道写给谁）绝不许把邮局搞崩**"
        //      ⇒ **直接不写回执** （那封信本来就会被挪进退信，不必也不能回执）。
        //   ⚠️ 这里**不判 `refused`** —— 能走到这一行的信**验签已经过了** （验不过的早被挪进退信）；
        //      "拒收"那份回执要写在**验签不过那一条路上** （下一版补 —— 设计文档判据 90）。
        //   读**信封里的投递说明** （不是读"发信时的返回值" —— 那个**没随信过来**；
        //      我第一版就写成读 `env.wakePrediction.offlineOnly` ⇒ 那是 `send` 的**返回值**、不在信封里 ⇒
        //      对"只收离线"者发在线**错判成 `accepted-online`** ⇒ 现场抓出来，改成读 `deliveryNote`）。
        //   **投递说明优先** （设计文档原话："`disposition` **优先取发件人写下的投递说明**"——
        //      "那才是**当时怎么判的**"）—— 但**只在"这封信是在线件"时才谈得上"降级"**：
        //      发件人**自己写的** `mode: 'offline'` ⇒ 那本来就是离线件 ⇒ `delivered-offline` 
        //      （"降级"这个词只对**在线件**有意义）。
        //      ⚠️ "对方只收离线"要看，但**必须和 `mode === 'online'` 一起判** ——
        //        我前两版都栽在这儿：先是漏了它（错判成 `accepted-online`），
        //        后是判过头（把"显式离线件"也判成 `by-declaration`）—— 两次都是**现场抓出来**的。
        const disposition = env.mode === 'online'
          ? (env.deliveryNote === 'offline-only'
            ? 'delivered-offline-by-declaration'
            : (env.deliveryNote === 'no-handshake' ? 'delivered-offline-by-stale' : 'accepted-online'))
          : 'delivered-offline'
        const ackEnv = seal({ v: V, kind: 'ack', id: env.id, from: as, to: env.from, seq: env.seq ?? 0, body: '', sha256: '', sentAtMs: Date.now(), re: env.id,
          by: as, ok: true, note: '', recipientState: meStateOf(as), disposition,
          // `peerStateAtSend` （设计文档判据 99："回执带上**发信人当时看到的状态**"）——
          //   它**从信封里读** （发信时写下的）—— 事后谁也推不出来"当时看到什么"。
          ...(env.peerStateAtSend ? { peerStateAtSend: env.peerStateAtSend } : {}) })
        atomicWrite(join(paths().ack(env.from), `${env.id}.${as}.ack.json`), JSON.stringify(ackEnv, null, 2))
        saveState(as, { ...st, seen: [...(st.seen ?? []), env.id] })
      }
      out.push({ ...row, kept: false, ...(hasInject ? { injected: true } : {}) })
    }
    return out
  }

  /** 把一封信排成人读的样子（给 inject 回调／CLI 用 —— 免得每个人各写一份） */
  const format = (env) => [
    `【${(env.mode ?? 'online') === 'offline' ? '离线' : '在线'}邮件】${env.from} → ${env.to}`,
    env.subject ? `主题：${env.subject}` : '',
    env.body,
  ].filter(Boolean).join('\n')

  const api = { apiVersion, send, pump, verify, hello, helloFresh, declaredOnlineCap, declaredRecv, declaredQuiet, inQuietHours, format, paths, root, keyHex, digest, seal, sign, loadState,
    // 签名域**必须暴露出来** （2026-10-10 修）——
    //   "一套真相"的前提是**别人拿得到**：`verify` 包原来自己抄了一份 ⇒ 两边会漂移
    //     ⇒ 我加 `peerStateAtSend` 之后，**完全合法的信被判"未登记字段"、当场挪进退信** （实测抓出来的）。
    //   `FIELD_ORDER` 就是**签名域的唯一真相** ⇒ `verify` 通过 `cfg.bus.fields()` 读它。
    //   （不知道这条链的人会以为"加个字段进 FIELD_ORDER 就够了" —— 而**下游那份没跟上**）
    FIELD_ORDER: [...FIELD_ORDER], LEGACY_FIELDS: [...LEGACY_FIELDS] }
  return api
}

/** 插件入口：挂进 Cordis 风格的 ctx（拿不到容器也能被 CLI 直接 import 使用） */
export function apply(ctx, config = {}) {
  const services = {
    roster: ctx?.get?.('whale.roster'),
    types: ctx?.get?.('whale.types'),
    gate: ctx?.get?.('whale.gate'),
    deliver: ctx?.get?.('whale.deliver'),
    // 安全校验的**策略**（开关／白名单／提示）—— 由第七件提供；
    //   没装 ⇒ `undefined` ⇒ 核心照旧验签（向后兼容）
    verify: ctx?.get?.('whale.verify'),
  }
  const bus = createBus({ ...config, services })
  if (typeof ctx?.provide === 'function') ctx.provide('whale.bus', bus)
  return bus
}
