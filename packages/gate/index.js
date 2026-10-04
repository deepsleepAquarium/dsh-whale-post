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
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
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
    types: {
      // 样例桶：数值都是**示例值**，按需要自己定
      direct: { label: 'direct', limit: 100 },
      broadcast: { label: 'broadcast', limit: 20 },
      club: { label: 'club', limit: 40 },
      offline: { label: '离线', limit: 50, perSend: true },
    },
    // ★没在本表里的类型 ⇒ 落这个**默认桶**（独立审计 2026-10-05：原来直接判"配额桶不认识"⇒ 拒发，
    //   于是"注册一个新类型"在闸这一层根本不成立 ✗ —— 闸的类型表**不该**变成第二套真相）
    defaultLimit: 100,
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
    renameSync(tmp, file)
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

  /** 本封算几个"单位"：离线件按**发信次数**（1 条）；其余按收件人数（组名可以配成 1 单位） */
  function quotaUnits(letter, types) {
    const t = types?.resolve?.(letter.type)
    const targets = letter.targets ?? [letter.to]
    if (letter.mode === 'offline') return 1
    if (t && t.perSend === true) return 1
    if (Array.isArray(letter.groupMembers) && letter.groupMembers.length) {
      const inside = targets.filter((x) => letter.groupMembers.includes(x)).length
      return (inside > 0 ? 1 : 0) + (targets.length - inside)
    }
    return targets.length
  }
  function bucketOf(letter) {
    return letter.mode === 'offline' ? 'offline' : (letter.type ?? 'direct')
  }

  function check(letter = {}) {
    const loop = cfg.loop
    const flat = flattenAck(letter.body)
    if (!letter.force) {
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
    const units = quotaUnits(letter, { resolve: (id) => cfg.quota.types[id] })
    const over = Number.isFinite(cap.limit) && used + units > cap.limit
    if (over && cfg.quota.onOver === 'reject') {
      return { reject: true, reason: `配额（${cap.label}）：今日已用 ${used}/${cap.limit}，本封要 ${units} ⇒ 越额拒发。` +
        `要少花就**合并成一封**再发；离线件有独立额度（默认 50 条/天）；确需照发可把闸设成 price 档（照发但计费）。` }
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
    const units = quotaUnits({ ...letter, targets: tg }, { resolve: (id) => cfg.quota.types[id] })
    const over = Number.isFinite(cap.limit) ? Math.max(0, b.units + units - cap.limit) : 0
    const charge = Math.min(units, over)
    const bytes = Buffer.byteLength(letter.body ?? '', 'utf8')
    const feeCent = Number.isFinite(cap.limit) ? charge * cfg.quota.feePerUnitCent + (bytes * charge / Math.max(1, units) / 200) * cfg.quota.feePer200BCent : 0
    d.letters += 1
    if (letter.force) d.forced = (d.forced ?? 0) + 1      // ★--force 绕过三道闸 ⇒ 留痕（独立复核建议）
    if (bucket === 'offline') d.offlineLetters = (d.offlineLetters ?? 0) + 1     // ★离线条**不并进** units（单位是计费口径）
    else d.units += units
    d.bytes = (d.bytes ?? 0) + bytes
    b.letters += 1
    b.units += units
    b.over += charge
    b.feeCent = Number((b.feeCent + feeCent).toFixed(4))
    d.recent = [...(d.recent ?? []), { to: letter.to, atMs: letter.sentAtMs ?? Date.now() }].slice(-200)
    j.recent = [...(j.recent ?? []), { to: letter.to, atMs: letter.sentAtMs ?? Date.now() }].slice(-200)
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
  if (ctx && typeof ctx === 'object') ctx.whale = { ...(ctx.whale ?? {}), gate }
  return gate
}
