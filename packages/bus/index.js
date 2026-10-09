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
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'

export const name = 'whale-bus'
export const apiVersion = 1
export const V = 1
const FIELD_ORDER = ['v', 'kind', 'id', 'from', 'to', 'seq', 'subject', 'body', 'sha256', 'sentAtMs', 'type', 'mode', 're', 'hop']
/**
 * ★★**已知但已废弃**的信封字段 ✗（2026-10-10 从共享邮局根里真信上学到的）：
 *
 *   ★来源 ✗：缸里那套的**更晚决定**是"**桶分只看信封 `mode`，不看 `auth`** ⇒ **信封格式一字未改、老信与收端全兼容**"，
 *   ⚠️ 但 `auth`（`self`／`relay`／`authorized`）**在过渡期真被写进过信封** ⇒ 共享根里躺着三封这样的信。
 *
 *   ★为什么"放过它"是安全的 ✗：
 *     · 它**不进签名域** ⇒ **改它不影响签名** —— 这本来是危险信号；
 *     · 但**它现在没有任何语义**（那一套的桶分已经改用 `mode` 了）⇒ ★**改它也没用** ✓；
 *     · ★★**关键是：`seal()` 仍然拒它** ✗ ⇒ **新信里绝不许再出现**（没登记字段一律抛 ✓）。
 *
 *   ★★所以这里的口径是：**旧信放行（当它是历史），新信照样 fail-closed** ✓。
 *   ⚠️ 别的实现看到这个：★**别照抄着往信封里加字段** ✗ —— 加字段必须同时进 `FIELD_ORDER` ✓。
 */
const LEGACY_FIELDS = ['auth']

const DEFAULTS = {
  root: undefined,              // 信箱根（不传 ⇒ 环境变量 WHALE_POST_ROOT ⇒ 当前目录 .whale-mail）
  keyFile: undefined,           // 签名密钥文件（不传 ⇒ <root>/signing.key，首次用到时自动生成 32 字节）
  maxBody: 64 * 1024,           // 正文上限（字节）
  requireHello: true,           // 要不要握手（协议不许"像 UDP 那样"直接发）
  helloMaxAgeMs: 24 * 3600 * 1000,
  // ★默认邮件类型：**这是配置** ✗，不是写死在核心里的常量 —— 独立审计 2026-10-05 指出
  //   "核心不认识任何类型标识"与这里硬编码 `'direct'` 矛盾 ⇒ 挪进 config ✓。
  //   配成 `null` ⇒ **不替调用方猜类型** ✗：没显式给 type 的信直接被拒（宁可拒，不替人决定 ✓）。
  defaultType: 'direct',
    // ★★只收离线的成员（2026-10-10，缸内口径移植）：★属性名**由配置给** ——
    //   核心不认识任何具体属性名（ACCEPTANCE 的 戊）。配了它 ⇒ 对带该属性的成员**发在线即拒发**：
    //   非 0 退出 ＋ 不落信箱 ＋ 不许静默降级 ＋ 文案带出路（缸里 2026-10-06 定的口径）。
    //   ★不配（默认）⇒ 这一条完全不启用（向后兼容：老部署行为一字不变）。
    offlineOnlyFlag: undefined,
    // ★★被**明确**标成休眠的成员（2026-10-10 缸内口径移植）：属性名由配置给 ——
    //   核心不认识它 ✓；★**不根据"多久没 hello"自己猜休眠** ✗（那是猜，缸里明说"明确的 dormant 才退"✓）。
    //   配了它 ⇒ 对带该属性的成员**当场拒发**（非 0 ＋ 信不进它的信箱 ＋ 文案带出路）；
    //   ★只部分休眠（发给组）⇒ 只投给醒着的，并把剔掉谁如实带回去 ✓。★不配 ⇒ 这一条完全不启用 ✓。
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
    renameSync(tmp, file)
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
  /** ★fail-closed：没登记的字段一律不许封（否则"加字段忘了进签名域"＝那个字段可被随便改、验签照样过） */
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
    // ★类型校验只问接口（核心不认识任何类型标识）
    if (env.type !== undefined && services.types && typeof services.types.resolve === 'function' && !services.types.resolve(env.type)) {
      e.push(`未注册的邮件类型：${env.type}`)
    }
    // ★★ 安全校验的**策略**归 `whale.verify` 包（"默认禁用"是主人 2026-10-09 定的口径）：
    //   · 装了且**开启** ⇒ 先按它的判断（含白名单）；它放行 ⇒ 下面照旧做 HMAC（双保险，无害）
    //   · 装了但**禁用** ⇒ 它返回 `skipped` ⇒ ★跳过 HMAC（★这才让"默认禁用"真的生效 ✗）
    //   · **没装** ⇒ 照旧验签（向后兼容：老部署行为一个字不变 ✓）
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
    // ★fail-closed：不在签名域里的字段 ⇒ **拒**（否则"加字段忘了进 FIELD_ORDER"＝那个字段可被悄悄改）
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
    // ★`recent` 必须**去重合并** ✗：原来直接拼接 ⇒ claimSeq 与收尾各存一次 ⇒ 每发一封信翻四倍
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
  function hello({ as } = {}) {
    if (!as) throw new Error('hello 需要 as')
    ensure()
    const env = seal({ v: V, kind: 'hello', id: `hello-${as}`, from: as, to: '*', seq: 0, body: '', sentAtMs: Date.now() })
    atomicWrite(paths().hello(as), JSON.stringify(env, null, 2))
    return env
  }
  function helloFresh(as) {
    try {
      const env = JSON.parse(readFileSync(paths().hello(as), 'utf8'))
      if (verify(env).length) return false
      return Date.now() - Number(env.sentAtMs ?? 0) < cfg.helloMaxAgeMs
    } catch { return false }
  }

  // ★组员名单（给闸算"一个组算 1 单位"用）：roster 有 group() 才有；没有就返回 undefined（⇒ 逐人计）
  //   ⚠️ 这段必须在**核心**里做 —— 闸不认识名字，只认"这些人是同一组"这件事
  function groupMembersOf(to) {
    const R = services.roster
    const g = R && typeof R.group === 'function' ? R.group(to) : undefined
    return Array.isArray(g) && g.length ? g.map(String) : undefined
  }
  // ── 收件人解析（★只问 roster 接口，核心不认识名字）─────────────────────
  function resolveTargets(to, { as, force }) {
    const roster = services.roster
    if (!to || typeof to !== 'string') throw new Error('收件人（to）必须是字符串')
    const R = roster
    const has = (id) => (R && typeof R.has === 'function' ? R.has(id) : false)
    const list = () => (R && typeof R.list === 'function' ? R.list().map((m) => String(m.id ?? m)) : [])
    // 组名：roster 可选扩展 group(name) ⇒ 没有就当"人名"处理
    const g = R && typeof R.group === 'function' ? R.group(to) : undefined
    // ★★群发清单（2026-10-10）：优先问 `roster.broadcast()` —— ★它按配置剔掉"不该群发的人" ✓，
    //   而**核心不认识那个属性名** ✓；没有这个接口 ⇒ 退回完整名单（向后兼容：老部署行为一字不变 ✓）
    const all = (R && typeof R.broadcast === 'function' ? R.broadcast().map(String) : list()).filter((id) => id !== as)
    if (to === 'all') return all
    if (g) {
      // ★组员必须**在名单里**才投（独立审计 2026-10-05：原来"幽灵组员"也能收到信 ⇒ 会往名单外的信箱写文件 ✗）
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
  function claimSeq(as) {
    const s = loadState(as)
    const seq = Number(s.nextSeq ?? 1)
    s.nextSeq = seq + 1
    saveState(as, s)
    return seq
  }
  function send(letter = {}) {
    ensure()
    const { as, to, subject = '', body, mode, type: typeIn, re, force = false } = letter
    // ★类型：显式给 ⇒ 用它；没给 ⇒ 用配置里的默认（默认也配成 null ⇒ **拒发**，不替调用方猜 ✓）
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
    let skippedDormant = []          // ★被明确标成休眠、因此**没投**的收件人（如实带回去 ✓）
    if (targets.length === 0) throw new Error(`收件人算出来是空的（to=${to}）—— 别发没有收件人的信`)
    // ★★"只收离线"的成员：属性名**由配置给**（★核心不认识任何具体属性名 ✓）——
    //   对它们发在线 ⇒ **拒发**：非 0 ＋ 不落信箱 ＋ 不许静默降级 ✗ ＋ 文案**必须带出路** ✓
    //   （缸里口径：不然有人以为是故障，转而去 `--force` ✗）
    //   ⚠️ 这是**物理约束**（那个成员根本收不到在线件），**不是"闸"** ⇒ ★它**先于闸**、且 `--force` 不豁免 ✗
    //   ⚠️ 用**展开后的 targets** ✓ ⇒ 发给一个组、组里有人只收离线，一样拦得住 ✓
    if (m === 'online' && cfg.offlineOnlyFlag && services.roster && typeof services.roster.flag === 'function') {
      const stuck = targets.filter((t) => services.roster.flag(t, cfg.offlineOnlyFlag))
      if (stuck.length) {
        throw new Error(`拒发：${stuck.join('、')} 只收离线件（配置 offlineOnlyFlag='${cfg.offlineOnlyFlag}'）—— ` +
          `请用 --mode offline 重发。★这不是故障，--force 也不豁免：它们收不到在线件。`)
      }
    }
    // ★★被**明确**标成休眠的成员（2026-10-10 缸内口径移植：**明确的 `dormant` 才退，不猜** ✗）——
    //   ★属性名由配置给（`dormantFlag`），核心不认识它 ✓。
    //   ★★**不许根据"多久没 hello"自己猜休眠** ✗ —— 那是猜；**必须有明确标记** ✓。
    //   ★对它们发信 ⇒ **当场拒发**（非 0 ＋ 信**不进它的信箱** ＋ 文案带出路 ✓）——
    //   否则信会**永远堆在一个不会有人来的信箱里**，而发信人还以为发成功了 ✗。
    //   ★部分休眠 ⇒ 只投给醒着的，并把"剔掉了谁"**如实带回去** ✓（不许静默 ✓）。
    if (cfg.dormantFlag && services.roster && typeof services.roster.flag === 'function') {
      const asleep = targets.filter((t) => services.roster.flag(t, cfg.dormantFlag))
      if (asleep.length === targets.length) {
        throw new Error(`拒发：${asleep.join('、')} 被明确标成休眠（配置 dormantFlag='${cfg.dormantFlag}'）—— ` +
          `信不会有人来取，所以不合信箱。★换个人发，或先让它醒（把名单里那个标记去掉再发）；--force 也不豁免。`)
      }
      if (asleep.length) {
        targets = targets.filter((t) => !asleep.includes(t))
        skippedDormant = asleep
      }
    }
    if (cfg.requireHello && !force) {
      const missing = targets.filter((t) => !helloFresh(t))
      if (missing.length) {
        throw new Error(`未与 ${missing.join('、')} 建立握手（对方没有新鲜的 hello，或已过期）—— ` +
          `协议不许"像 UDP 那样"直接发。让对方先跑 hello；确需强发用 --force（收信侧只认签名与摘要、不看握手，会照收）。`)
      }
    }
    // ★闸：只问接口（闸可以拒，也可以记账）—— 把它判断需要的东西都给出去（含 force／链深／组员名单）
    //   ⚠️ `groupMembers` 必须由**核心**解析后传下去：闸不认识名字，它只知道"这些人算一个组"
    const hop0 = (re === undefined || re === '') ? undefined : hopOf(re)
    const groupMembers = groupMembersOf(to)
    const gate = services.gate
    if (gate && typeof gate.check === 'function') {
      const r = gate.check({ as, to, targets, subject, body, mode: m, type, re, force, hop: hop0, groupMembers })
      if (r && typeof r === 'object' && r.reject) throw new Error(`闸拒发：${r.reason}`)
    }
    // ★发号放在**闸之后**（独立审计 2026-10-05）：被拒的信不该烧掉一个序号 ⇒ 水位与真实发信量对得上
    const seq = claimSeq(as)
    const id = `${Date.now().toString(36)}-${as}-${String(seq).padStart(4, '0')}-${randomUUID().slice(0, 8)}`
    const hop = hop0
    const env = seal({ v: V, kind: 'msg', id, from: as, to, seq, subject, body, sha256: digest(body), sentAtMs: Date.now(), type, mode: m, ...(hop === undefined ? {} : { re, hop }) })
    for (const t of targets) atomicWrite(join(paths().inbox(t), `${id}.msg.json`), JSON.stringify(env, null, 2))
    // ★投递策略：只问接口（核心不认识"会话"）
    let verdict = m === 'online' ? 'delivered' : 'kept'
    if (services.deliver && typeof services.deliver.deliver === 'function') {
      verdict = services.deliver.deliver(env, { bus: api, probes, targets }) ?? verdict
    }
    if (gate && typeof gate.record === 'function') gate.record({ ...env, as: env.from, groupMembers }, targets)
    const st = loadState(as)
    st.recent = [...(st.recent ?? []), { to, atMs: env.sentAtMs, subject: String(subject).slice(0, 40) }].slice(-200)
    saveState(as, st)
    return { id, seq, to, targets, mode: m, type, verdict, hop, env, ...(skippedDormant.length ? { skippedDormant } : {}) }
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

  // ── 收信（★"不投也不消费"必须在**收信侧**落实 —— 发信侧的判定拦不住收信侧）──
  //   keep 四种形态：
  //     · 不传（默认）⇒ ★**没有读者就不消费**：收信人此刻没有活体会话、也没给 `inject`／`reader`
  //       ⇒ 信**原样留在 `inbox/`**（不搬 seen、不删原件、不写 ack）⇒ **信只会晚到，不会不到**
  //     · `keep: true` ⇒ 全都不消费（只看一眼）
  //     · `keep: false` ⇒ **显式**要求消费（调用方自己保证读得到）
  //     · `keep: (env) => boolean` ⇒ 逐封判（和我们线上邮差插件的写法一致）
  //   `reader: true` ＝ "我就是那个读者，我自己负责把信交出去"（例如 CLI 把信打进终端）
  //   `inject: (env) => void` ＝ ★**真的注入回调**（独立复核 2026-10-05 指出"名不副实"后改的）：
  //     给了它，`pump` 就**真的**把信交给它；★**它抛异常 ⇒ 不消费**（信原样留着）
  //     —— 与 `deliver` 里那条保命规则同一条：**交不出去的信，绝不许当成交出去了** ✗。
  //   ⚠️ **光有"活体会话"不构成消费理由** ✗ —— 会话活着，不等于信交到了读者手里。
  function pump({ as, keep, reader = false, inject } = {}) {
    ensure()
    if (!as) throw new Error('pump 需要 as（收件人）')
    const hasInject = typeof inject === 'function'
    const sessionOf = probes.sessionOf ?? services.deliver?.sessionOf
    const liveNow = () => {
      try { const s = typeof sessionOf === 'function' ? sessionOf(as) : undefined; return !!(s && s.live) } catch { return false }
    }
    const canRead = reader === true || hasInject
    const keepThis = (env) => {
      if (keep === true) return true
      if (keep === false) return false
      if (typeof keep === 'function') return !!keep(env)
      return !canRead                                   // ★默认：没有读者 ⇒ 不消费
    }
    const dir = paths().inbox(as)
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.msg.json')).sort() : []
    const out = []
    for (const f of files) {
      const p = join(dir, f)
      let env
      try { env = JSON.parse(readFileSync(p, 'utf8')) } catch (err) {
        atomicWrite(join(paths().dead, f), readFileSync(p, 'utf8'))
        unlinkSync(p)
        out.push({ ok: false, file: f, why: `读不成信（${err.message}）⇒ 已挪进"退信"` })
        continue
      }
      const probs = verify(env)
      if (probs.length) {
        atomicWrite(join(paths().dead, f), JSON.stringify(env, null, 2))
        unlinkSync(p)
        out.push({ ok: false, file: f, id: env.id, why: probs.join('；') + ' ⇒ 已挪进"退信"' })
        continue
      }
      // ★只处理"信"（独立审计 2026-10-05：hello／ack 信封原来会被当普通信消费 ✗）
      if (env.kind !== 'msg') {
        atomicWrite(join(paths().dead, f), JSON.stringify(env, null, 2))
        unlinkSync(p)
        out.push({ ok: false, file: f, id: env.id, why: `这不是一封信（kind=${env.kind}）⇒ 已挪进"退信"` })
        continue
      }
      // ★收件人核对（独立审计 2026-10-05：原来不看 `to` ⇒ 别人掉进我信箱的信会被我消费并回执 ✗）
      //   认两种：直接点名我；发给"我所属的组"。**没有 roster 接口时跳过**（认不了组，不冤枉信）
      const rosterHasGroup = services.roster && typeof services.roster.group === 'function'
      const memberOfGroup = rosterHasGroup ? services.roster.group(env.to) : undefined
      const isMine = env.to === as || (Array.isArray(memberOfGroup) && memberOfGroup.includes(as))
      if (!isMine && rosterHasGroup) {
        atomicWrite(join(paths().dead, f), JSON.stringify(env, null, 2))
        unlinkSync(p)
        out.push({ ok: false, file: f, id: env.id, why: `这封信不是给你的（to=${env.to}）⇒ 已挪进"退信"` })
        continue
      }
      const st = loadState(as)
      // ★幂等：`seen/` 目录**本身就是永久证据**（状态数组会被截断/丢）—— 两边都认
      //   （独立审计 2026-10-05：只靠 `seen` 数组 ⇒ 重投同一封就会二次交付 ✗）
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
          why: keep === true ? 'keep=true：只看不消费'
            : `★没有读者（没给 inject、也没声明 reader${liveNow() ? '；**有活体会话也不算**：会话活着不等于信交到了读者手里' : ''}）⇒ 不投也不消费，原样留在信箱里`,
        })
        continue
      }
      // ★真注入（独立复核指出 `inject` 原本"名不副实"）：**交到读者手里才算数**；
      //   抛异常 ⇒ **不消费** —— 信原样留着，下次再来（不制造"偶发丢信"）
      if (hasInject) {
        try {
          inject(env)
        } catch (err) {
          const msg = String(err && err.message ? err.message : err)
          out.push({ ...row, kept: true, injectError: msg, why: `★注入抛异常 ⇒ **不消费**（信留在信箱里，没搬 seen、没写 ack）：${msg}` })
          continue
        }
      }
      atomicWrite(join(paths().seen(as), f), JSON.stringify(env, null, 2))
      unlinkSync(p)
      if (!dup) {
        const ack = seal({ v: V, kind: 'ack', id: env.id, from: as, to: env.from, seq: env.seq ?? 0, body: '', sha256: '', sentAtMs: Date.now(), re: env.id })
        atomicWrite(join(paths().ack(env.from), `${env.id}.${as}.ack.json`), JSON.stringify(ack, null, 2))
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

  const api = { apiVersion, send, pump, verify, hello, format, paths, root, keyHex, digest, seal, sign, loadState }
  return api
}

/** 插件入口：挂进 Cordis 风格的 ctx（拿不到容器也能被 CLI 直接 import 使用） */
export function apply(ctx, config = {}) {
  const services = {
    roster: ctx?.get?.('whale.roster'),
    types: ctx?.get?.('whale.types'),
    gate: ctx?.get?.('whale.gate'),
    deliver: ctx?.get?.('whale.deliver'),
    // ★安全校验的**策略**（开关／白名单／提示）—— 由第七件提供；
    //   没装 ⇒ `undefined` ⇒ 核心照旧验签（向后兼容 ✓）
    verify: ctx?.get?.('whale.verify'),
  }
  const bus = createBus({ ...config, services })
  if (typeof ctx?.provide === 'function') ctx.provide('whale.bus', bus)
  return bus
}
