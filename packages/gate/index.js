/**
 * dsh-whale-post-gate —— 闸（示例② 的挂点）：配额与计费 ＋ 回环闸
 *
 * 接口：`ctx.whale.gate`（apiVersion 1）
 *   check(letter) → 'pass' | { reject, reason }
 *   record(letter, targets)        ← 可选扩展：投递成功后才记账（被拦下的信不占额度）
 *   report({ as, days })           ← 可选扩展：查账（只读）
 *
 * 装了三道闸，每道都写明了为什么：
 *   ① **纯回执拒发**：正文去掉空白标点后只剩"收到／好的／谢谢"⇒ 拒发。
 *      回执本来就该由收信方自动写 ack，不必再发一封信把人家叫醒。
 *   ② **同对回环闸**：同一对（你→对方）在 N 分钟内已发 M 封 ⇒ 拒发，先合并成一封。
 *   ③ **链深闸**：带 `re` 的信按父信 hop 递推，到第 K 跳 ⇒ 拒发（链条必须落地成结论）。
 *   ④ **配额**：分桶计额度；离线件**独立计**（按发信次数，1 次发信＝1 条，组发不翻倍）。 *      ★`quota.onOver` 决定越额时怎么办：
 *        · `'reject'`（默认）＝ **拒发**（退出码非 0、不落信箱）——"多发一封＝多烧一份，省着点"；
 *        · `'price'`       ＝ **价格闸**：照发，但记账计费（"闸是价格闸，不是封嘴闸"）。
 *
 * ★闸只认接口：类型表从 `ctx.whale.types` 取，名字从 `ctx.whale.roster` 取 —— 核心没有一行名字。
 *
 * ⚠️ 两条老实话（免得下一个人把它当安全边界）：
 *   · ③ **链深闸依赖回信人老实带 `re`** —— 不带就重置链深 ⇒ 它是**礼貌闸／省米闸**，**不是安全边界**；
 *   · `force: true` 会**整条绕过**这三道（这是有意留的），但**留痕**：台账当日记 `forced` 计数（`report()` 看得到）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
/** ★同步睡一会儿（Atomics.wait 是本进程内唯一可靠的同步 sleep ✓）—— Windows `rename` 撞忙时退避用 ✓ */
const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } catch { /* 环境不支持就算了 ✓ */ } }
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

export const name = 'whale-gate'
export const apiVersion = 1

const DEFAULTS = {
  loop: {
    ackMaxBytes: 40,
    // ★中英都认（独立审计 2026-10-05：原来只认中文 ⇒ 英文回执成了绕过闸的后门 ✗）；
    //   判定方式＝**把空白标点去掉后整串由"回执词"拼成** ⇒ `got it — thanks, all clear` 也拦得住
    ackOnly: /^(已读|收到|好的|好|行|ok|同意|赞成|谢谢|多谢|不客气|辛苦了|辛苦|明白|了解|知道了|没问题|嗯|赞|thx|thanks|thankyou|manythanks|ack|roger|copy|noted|understood|sure|np|gotit|willdo|allclear|noworries)+$/i,
    pairWindowMs: 20 * 60 * 1000,
    pairMax: 3,
    hopMax: 3,
  },
  quota: {
    onOver: 'reject',        // 'reject' 拒发 ／ 'price' 照发但计费
    dayBoundaryHour: 0,      // 日界（0 ＝ 自然日；写成 9 就是"早九点到次日早九点算一天"）
    feePerUnitCent: 1,       // 越额费率（示例值，自己改）
    feePer200BCent: 0.1,     // 越额字节费率（示例值）
    // ★★分桶规则（2026-10-10 缸内口径移植）：**默认不配 ⇒ 行为一字不变** ✓。
    //   配了它 ⇒ 从上往下"**第一个命中的赢**"，按 `field` 取信里的值、`equals` 比对、命中就落 `bucket`。
    //   ★字段名与桶名**全由配置给** —— 本件里不出现任何具体名字 ✓（守 ACCEPTANCE 的"戊"）。
    //   例：按"授权级别"分四档 ⇒
    //     bucketRules: [ { field: 'auth', equals: 'self',  bucket: 'self'  }, … ]
    bucketRules: undefined,
    // ★★S8 手机在线件小日上限（2026-10-10 缸内口径移植）✗✓ —— **默认不配 ⇒ 行为一字不变** ✓
    //   ★为什么要它：★**每封在线件 ＝ 叫醒一个成员做一次满上下文推理** ✗（**最贵的那一步** ✓）
    //   ⇒ "可能一次醒来连发几封"的成员（手机）要给一个**小日上限** ✓（★离线件**不受这条限** ✓ —— 它躺着等人 ✓）。
    //   ★★上限 ＝ `min(收件人**自报**的 onlineCapPerDay, phoneOnlineCap)` ✗✓
    //      —— ★**"收件习惯由它自己声明，而声明只能更保守"** ✓（它能把上限调到 1 ✓，**调不到天花板之上** ✗）。
    //   ★**谁算"手机"由配置给**（属性名 ↓）⇒ 本件里不出现任何具体名字 ✓。
    phoneFlag: undefined,
    phoneOnlineCap: 3,       // ★天花板（★自报**只能更保守** ⇒ 实际额度 = min(自报, 这个) ✓）
    // ★★一条规则都没命中时落哪个桶 ✗ —— **必须给**（配了 bucketRules 才有意义）：
    //   不给的话，"带新字段的信"会掉回 type 桶（可能是对的，也可能是你没想到的）✓
    defaultBucket: undefined,
    types: {
      // 样例桶：数值都是**示例值**，按需要自己定
      direct: { label: 'direct', limit: 120 },
      broadcast: { label: 'broadcast', limit: 45 },
      club: { label: 'club', limit: 60 },
      offline: { label: '离线', limit: 80, perSend: true },
    },
    // ★没在本表里的类型 ⇒ 落这个**默认桶**（独立审计 2026-10-05：原来直接判"配额桶不认识"⇒ 拒发，
    //   于是"注册一个新类型"在闸这一层根本不成立 ✗ —— 闸的类型表**不该**变成第二套真相）
    defaultLimit: 120,
  },
}

const flattenAck = (s) => String(s ?? '').replace(/[\s\p{P}\p{S}]/gu, '')

export function createGate(config = {}) {
  const cfg = {
    ...DEFAULTS,
    ...config,
    loop: { ...DEFAULTS.loop, ...(config.loop ?? {}) },
    quota: { ...DEFAULTS.quota, ...(config.quota ?? {}), types: { ...DEFAULTS.quota.types, ...(config.quota?.types ?? {}) } },
  }
  const root = () => cfg.root ?? process.env.WHALE_POST_ROOT ?? join(process.cwd(), '.whale-mail')
  const stateOf = (as) => join(root(), 'state', `quota-${as}.json`)
  const atomic = (file, text) => {
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.tmp-${randomUUID().slice(0, 8)}`
    writeFileSync(tmp, text, 'utf8')
    // ★★Windows 的 `rename` 在"目标正被读／被杀软扫"时会抛 EPERM／EBUSY ✗ ⇒ **退避重试，最后兜底直写** ✓
    //   ★缸里正本的记录：★这是 **12 路压测抓出来的坑** ✓ —— ★而我们 2026-10-10 的 12 路压测**又撞了一次** ✓
    //   （★当时账本 `quota-web.json` 的 rename 抛 EPERM、那个进程直接退出码 1 ✓）
    for (let i = 0; i < 6; i += 1) {
      try { renameSync(tmp, file); return file } catch (err) {
        const busy = err && (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES')
        if (!busy) throw err
        sleepSync(5 + i * 10)
      }
    }
    writeFileSync(file, text, 'utf8')       // ★兜底：宁可少一次原子性，也不要记账失败 ✓
    try { unlinkSync(tmp) } catch { /* 临时文件清不掉不是错 ✓ */ }
    return file
  }
  const localDay = (ms = Date.now()) => {
    const d = new Date(ms - Number(cfg.quota.dayBoundaryHour) * 3600 * 1000)
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }
  function load(as) {
    try {
      const j = JSON.parse(readFileSync(stateOf(as), 'utf8'))
      if (j && typeof j === 'object' && j.days) return j
    } catch { /* 没台账 ⇒ 从零起 */ }
    return { as, note: '配额台账（由 dsh-whale-post-gate 自动写）', days: {} }
  }
  const save = (as, j) => { atomic(stateOf(as), JSON.stringify(j, null, 2)); return j }

  /** 本封算几个"单位"：★落在 `perSend: true` 的桶 ⇒ 按**发信次数**（1 条）；其余按收件人数（组名可以配成 1 单位） */
  function quotaUnits(letter, types, bucket) {
    const targets = letter.targets ?? [letter.to]
    const t = types?.resolve?.(letter.type)
    // ★2026-10-10：原来硬编码"离线 ⇒ 1"；现在**看它落在哪个桶**（桶可以按配置分，比如按授权级别 ✓）。
    //   ★省略 bucket ⇒ 退回老逻辑（离线 ⇒ 1）✓ —— 老部署行为一字不变。
    const b = bucket === undefined ? undefined : types?.resolve?.(bucket)
    if (b && b.perSend === true) return 1
    if (letter.mode === 'offline') return 1
    if (t && t.perSend === true) return 1
    if (Array.isArray(letter.groupMembers) && letter.groupMembers.length) {
      const inside = targets.filter((x) => letter.groupMembers.includes(x)).length
      return (inside > 0 ? 1 : 0) + (targets.length - inside)
    }
    return targets.length
  }
  /**
   * ★★把一封信映射到桶名 ✗ —— **规则由配置给**（`quota.bucketRules`）：本件里**不出现任何具体字段名／桶名** ✓。
   *   · 不配（默认）⇒ 行为一字不变：离线走 `offline` 桶，其余按 `type` ✓
   *   · 配了 ⇒ 从上往下**第一个命中的赢**；都不命中 ⇒ 落 `quota.defaultBucket`
   *   ⚠️ 都不命中时**必须落一个桶** ✗ —— 否则"带新字段的信"会变成"没有配额"，那是静默放行 ✓
   */
  function bucketOf(letter) {
    const rules = cfg.quota.bucketRules
    if (Array.isArray(rules) && rules.length) {
      for (const r of rules) {
        if (!r || typeof r !== 'object' || r.field === undefined || r.bucket === undefined) continue
        const v = letter[r.field]
        if (Object.prototype.hasOwnProperty.call(r, 'equals')) {
          if (String(v) === String(r.equals)) return String(r.bucket)
        } else if (v !== undefined && v !== null && v !== '') return String(r.bucket)
      }
      if (cfg.quota.defaultBucket !== undefined) return String(cfg.quota.defaultBucket)
    }
    return letter.mode === 'offline' ? 'offline' : (letter.type ?? 'direct')
  }

  /**
   * ★★S8："手机"的**当天在线件额度** ✗（★不适用 ⇒ `null` ✓）
   *   ★额度 ＝ **`min(收件人自报, phoneOnlineCap)`** ✗✓ —— ★**声明只能更保守** ✓。
   *   ★★没自报 ⇒ 用天花板 ✓（★"没说"不等于"可以一直叫醒它" ✓ —— 这条是**保护收件人**的 ✓）。
   *   ★离线件**不受这条限** ✓。
   */
  function phoneCapOf(id, ctx) {
    const flagName = cfg.quota.phoneFlag
    if (flagName === undefined || flagName === null || flagName === '') return null
    const roster = ctx && ctx.roster
    if (!roster || typeof roster.flag !== 'function') return null          // ★拿不到名单 ⇒ **不拦** ✓（宁可放过，不冤枉 ✓）
    if (!roster.flag(String(id), String(flagName))) return null            // ★不是"手机" ⇒ 这条不适用 ✓
    const declared = ctx && ctx.declaredCaps && Number(ctx.declaredCaps[String(id)])
    const ceiling = Number(cfg.quota.phoneOnlineCap)
    const cap = Number.isFinite(declared) && declared >= 0 ? Math.min(Math.floor(declared), ceiling) : ceiling
    return Number.isFinite(cap) && cap >= 0 ? cap : null
  }

  function check(letter = {}, ctx = {}) {
    const loop = cfg.loop
    const flat = flattenAck(letter.body)
    // ★★S8：手机**在线件**的小日上限 ✗ —— ★放在回环闸之前 ✓（★这道是"保护收件人"的，比"省米"更该先判 ✓）
    //   ★只看**在线件** ✓（离线件躺着等人，不受这条限 ✓）；★`--force` **不豁免** ✓（它保护的是收件人的推理代价 ✓）。
    if (letter.mode !== 'offline') {
      const tg = Array.isArray(letter.targets) && letter.targets.length ? letter.targets : [letter.to]
      for (const t of tg) {
        const cap = phoneCapOf(t, ctx)
        if (cap === null) continue
        const day = load(letter.as).days?.[localDay()] ?? null
        // ★按**收件人**数这个发信人今天已经给它发过几封在线件 —— ★"叫醒了几次"才是这条闸要数的东西 ✓
        const woke = Number(day?.byPhone?.[String(t)] ?? 0)
        if (woke >= cap) {
          return { reject: true, reason: `在线件上限（S8）：今天你已给「${t}」发过 ${woke} 封**在线件**，额度是 ${cap} 封／天` +
            `（★每封在线件 ＝ **叫醒对方做一次满上下文推理** ✗ —— 这是最贵的那一步）。` +
            `★攒一攒、合并成一封；★离线件**不受这条限**（它躺着等人 ✓）；确需照发加 --force。` }
        }
      }
    }
    // ★★★离线件豁免**整套回环闸** ✗✓（2026-10-10 从正本移植；★正本 29-31 三条判据 ＋ 「主人 2026-10-06 令」✓）
    //   ★为什么 ✗：★三道回环闸拦的都是"**别多叫醒人一次**" ✓ —— ★而**离线件根本不叫醒任何人**
    //   （它躺着等对方来收 ✓）⇒ ★拦它**没有任何收益**，只会把"想说的话"堵在发信人手里 ✓。
    //   ★★这正是"**信只会晚到，不会不到**"：★"闸"该拦的是**代价**，不是**表达** ✓✓。
    //   ⚠️ 只豁免**回环闸**（①纯回执／②同对／③链深）✓ —— ★**配额照旧** ✓（★离线桶独立计 ✓，见下面 ✓）。
    //   ⚠️ `--force` 本来也跳过这三道 ✓ ⇒ 两个条件是"或" ✓。
    if (!(letter.mode === 'offline' || letter.force)) {
      if (Buffer.byteLength(flat, 'utf8') > 0 && Buffer.byteLength(flat, 'utf8') <= loop.ackMaxBytes && loop.ackOnly.test(flat)) {
        return { reject: true, reason: `回环闸①（纯回执）：正文去掉空白标点后只剩「${flat}」这类字样 —— ` +
          `回执不必发信（收信方会自动写 ack）。真要有新事实／新决定就写进正文；确需照发加 --force。` }
      }
      const recent = (load(letter.as).recent ?? []).filter((r) => Date.now() - r.atMs < loop.pairWindowMs && r.to === letter.to)
      if (recent.length >= loop.pairMax) {
        return { reject: true, reason: `回环闸②（同对回环）：最近 ${Math.round(loop.pairWindowMs / 60000)} 分钟内你已给「${letter.to}」发过 ${recent.length} 封 —— ` +
          `每多一封就多叫醒对方一次。把要说的**合并成一封**再发；确需照发加 --force。` }
      }
      if (Number.isInteger(letter.hop) && letter.hop >= loop.hopMax) {
        return { reject: true, reason: `回环闸③（链深）：这封会是你俩这一链的第 ${letter.hop} 跳 —— 链条必须落地成结论（写进文档），别用信来回确认。` }
      }
    }
    const bucket = bucketOf(letter)
    const cap = cfg.quota.types[bucket] ?? { label: bucket, limit: cfg.quota.defaultLimit }
    const d = load(letter.as).days[localDay()] ?? { letters: 0, units: 0, byBucket: {}, recent: [] }
    const used = Number(d.byBucket?.[bucket]?.units ?? 0)
    const units = quotaUnits(letter, { resolve: (id) => cfg.quota.types[id] }, bucket)
    const over = Number.isFinite(cap.limit) && used + units > cap.limit
    if (over && cfg.quota.onOver === 'reject') {
      return { reject: true, reason: `配额（${cap.label}）：今日已用 ${used}/${cap.limit}，本封要 ${units} ⇒ 越额拒发。` +
        `要少花就**合并成一封**再发；离线件可以配成**独立额度**（条数自己定，示例见下）；确需照发可把闸设成 price 档（照发但计费）。` }
    }
    return 'pass'
  }

  /** 投递成功后才记账 ⇒ 被拦下的信不占额度 */
  function record(letter, targets) {
    const as = letter.as ?? letter.from                       // ★信封里字段叫 from，check 里叫 as —— 两处都认
    const tg = Array.isArray(targets) && targets.length ? targets : (letter.targets ?? [letter.to])
    const j = load(as)
    const day = localDay(letter.sentAtMs ?? Date.now())
    const d = j.days[day] ?? (j.days[day] = { letters: 0, units: 0, byBucket: {}, recent: [] })
    const bucket = bucketOf(letter)
    const cap = cfg.quota.types[bucket] ?? { label: bucket, limit: cfg.quota.defaultLimit }
    const b = d.byBucket[bucket] ?? (d.byBucket[bucket] = { letters: 0, units: 0, over: 0, feeCent: 0 })
    const units = quotaUnits({ ...letter, targets: tg }, { resolve: (id) => cfg.quota.types[id] }, bucket)
    const over = Number.isFinite(cap.limit) ? Math.max(0, b.units + units - cap.limit) : 0
    const charge = Math.min(units, over)
    const bytes = Buffer.byteLength(letter.body ?? '', 'utf8')
    const feeCent = Number.isFinite(cap.limit) ? charge * cfg.quota.feePerUnitCent + (bytes * charge / Math.max(1, units) / 200) * cfg.quota.feePer200BCent : 0
    d.letters += 1
    if (letter.force) d.forced = (d.forced ?? 0) + 1      // ★--force 绕过三道闸 ⇒ 留痕（独立复核建议）
    if (bucket === 'offline') d.offlineLetters = (d.offlineLetters ?? 0) + 1     // ★离线条**不并进** units（单位是计费口径）
    else d.units += units
    // ★★S8：数"今天叫醒过某个收件人几次" ✗ —— ★只数**在线件** ✓（离线件躺着等人，不算叫醒 ✓）
    //   ★记在**发件人**名下（`d` 就是 `as` 的当天台账 ✓）—— ★因为"叫醒几次"是**发出去的人**的动作 ✓
    if (letter.mode !== 'offline') {
      const byPhone = d.byPhone ?? (d.byPhone = {})
      for (const t of tg) byPhone[String(t)] = Number(byPhone[String(t)] ?? 0) + 1
    }
    d.bytes = (d.bytes ?? 0) + bytes
    b.letters += 1
    b.units += units
    b.over += charge
    b.feeCent = Number((b.feeCent + feeCent).toFixed(4))
    // ★★`recent` 是"**叫醒记录**" ✗ —— 只记**在线件** ✓（2026-10-10 改）
    //   ★为什么：★离线件**豁免整套回环闸** ✓（它不叫醒任何人 ✓）⇒ ★**让它占满 `recent`
    //   会把后面的**在线件**误拦** ✗✓ —— 那是"用不会叫醒的信，挤掉真的该发的那封" ✓。
    if (letter.mode !== 'offline') {
      d.recent = [...(d.recent ?? []), { to: letter.to, atMs: letter.sentAtMs ?? Date.now() }].slice(-200)
      j.recent = [...(j.recent ?? []), { to: letter.to, atMs: letter.sentAtMs ?? Date.now() }].slice(-200)
    }
    save(as, j)
    return { bucket, units, used: b.units, limit: cap.limit, over: charge, feeCent }
  }

  /** 查账（只读）：某人的今日与近 n 天 */
  function report({ as, days = 7 } = {}) {
    const j = load(as)
    const keys = Object.keys(j.days ?? {}).sort().slice(-days)
    const sum = keys.reduce((a, k) => {
      const d = j.days[k]
      return { units: a.units + Number(d.units ?? 0), offline: a.offline + Number(d.offlineLetters ?? 0), letters: a.letters + Number(d.letters ?? 0) }
    }, { units: 0, offline: 0, letters: 0 })
    return { as, today: j.days[localDay()] ?? null, spanDays: keys.length, ...sum, buckets: Object.keys(cfg.quota.types).map((t) => ({ bucket: t, limit: cfg.quota.types[t].limit, used: Number(j.days[localDay()]?.byBucket?.[t]?.units ?? 0) })) }
  }
  return { apiVersion, check, record, report, cfg, localDay, quotaUnits }
}

export function apply(ctx, config = {}) {
  const gate = createGate(config)
  if (typeof ctx?.provide === 'function') ctx.provide('whale.gate', gate)
  return gate
}
