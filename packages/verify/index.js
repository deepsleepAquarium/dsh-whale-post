/**
 * dsh-whale-post-verify —— 安全校验（信封验签 ＋ 名单白名单）★默认禁用（主人 2026-10-09 23:1x 定 ✓）
 *
 * 接口：`ctx.whale.verify`（apiVersion 1）
 *   verify(letter) → { ok, why?, skipped? }   ← 核心只问这一句
 *   status()       → { enabled, dayIndex, willNag, allowCount, … }
 *   nag()          → string | null            ← ★该印提示就返回文案；不该印就返回 null
 *   enable() / disable()
 *
 * ★三态设计（照主人原话 ✗；原文见 `docs/` 与缸内《上游记忆》✓）：
 *   ① **默认禁用** ✗ —— 未开启时 `verify()` 一律放行，但返回值里带 `skipped: true`
 *      （★让上层知道"这封没验过" ✓ —— 不许假装验过了 ✗）。
 *   ② **禁用中要提示** ✓ —— `nag()` 在未开启时返回一条醒目文案：
 *      "安全功能处于禁用中；建议开启，以免未知 agent 对其他 agent 发起欺骗或攻击" ＋ 一句开启方法。
 *   ③ ★**连提三天就不再提** ✗ —— 视为用户执意要在不安全的环境下使用；
 *      但 `status()` **永远**如实显示 `enabled: false`（★"不再提示"≠"关掉了安全" ✓）。
 *
 * ★它守的两条线（与全仓一致 ✗）：
 *   · **只认接口，不认名字** —— 白名单来自 `config.allow`；代码里没有任何成员名。
 *   · **顶层零 I/O** —— 读盘只发生在 `createVerify()` 之后的方法调用里；异常一律自己吞。
 *
 * ★验签怎么算 ✗：优先用 `config.bus`（或 `ctx.whale.bus`）给的 `digest`／`sign` ——
 *   这样它与核心**同一套算法**、不会各算各的；拿不到就用自己的内置实现（`sha256` ＋ `hmac`）。
 *   签名域与 `whale-bus` 的 `FIELD_ORDER` 一致（★`mode` 也在里面 ✓）。
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

export const name = 'whale-verify'
export const apiVersion = 1

/** ★与 whale-bus 完全一致的签名域（★`mode` 必须在里面 ✓） */
export const FIELD_ORDER = ['v', 'kind', 'id', 'from', 'to', 'seq', 'subject', 'body', 'sha256', 'sentAtMs', 'type', 'mode', 're', 'hop']

const DEFAULTS = {
  root: undefined,          // 信箱根（不传 ⇒ WHALE_POST_ROOT ⇒ 当前目录 .whale-mail）
  enabled: false,           // ★默认禁用 —— 这是主人定的，不是"还没写" ✗
  allow: [],                // ★白名单：允许的成员 id（空 ⇒ 不限制收件人）
  nagDays: 3,               // ★连提几天就不再提（主人 2026-10-09：三天）
  dayBoundaryHour: 0,       // 日界（0 ＝ 自然日）
  keyFile: undefined,       // 共享钥匙文件（不传 ⇒ <root>/signing.key）
  keysDir: undefined,       // 每设备钥匙目录（不传 ⇒ <root>/keys）—— 按信封**声明的发件人**取钥
  now: undefined,           // 注入时钟（自测用）
}

const sha256hex = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex')

export function createVerify(config = {}) {
  const cfg = { ...DEFAULTS, ...config }

  // ★时钟（独立审计 2026-10-09 抓出的坑 ✗）：
  //   原来写的是 `typeof cfg.now === 'function' ? cfg.now() : Date.now()` ——
  //   于是**传数字**（很自然的用法）会被**静默忽略**、悄悄用"现在"⇒ 三天规则整个算错，
  //   而且**不报错**（自测里五天全被算成同一天才发现 ✗）。
  //   现在：函数与数字都收；★给了**无效值**不静默退化 —— 记进 `status().clockWarning` 出声 ✓。
  const _nowCfg = config.now
  let clockWarning = null
  const clockMs =
    typeof _nowCfg === 'function' ? () => Number(_nowCfg())
      : (typeof _nowCfg === 'number' && Number.isFinite(_nowCfg)) ? () => _nowCfg
        : _nowCfg === undefined ? () => Date.now()
          : (() => { clockWarning = `now 取值无效（${typeof _nowCfg}）：只接受函数或有限数字，已退回 Date.now()`; return () => Date.now() })()

  const root = () => cfg.root ?? process.env.WHALE_POST_ROOT ?? join(process.cwd(), '.whale-mail')

  const stateFile = () => join(root(), 'state', 'security-nag.json')
  const keyFile = () => cfg.keyFile ?? join(root(), 'signing.key')
  const keyOfFile = (id) => (cfg.keysDir ? join(cfg.keysDir, `${id}.key`) : join(root(), 'keys', `${id}.key`))

  const localDay = (ms = clockMs()) => {
    const d = new Date(ms - Number(cfg.dayBoundaryHour) * 3600 * 1000)
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }

  // ── 状态（★顶层不读盘 —— 只在这些方法里读 ✓；坏文件一律退回默认，不炸 ✗）─────────
  function loadState() {
    try {
      const j = JSON.parse(readFileSync(stateFile(), 'utf8'))
      if (j && typeof j === 'object') {
        return {
          enabled: j.enabled === true,
          enabledAt: typeof j.enabledAt === 'string' ? j.enabledAt : null,
          firstSeenDay: typeof j.firstSeenDay === 'string' ? j.firstSeenDay : null,
          nagDays: Array.isArray(j.nagDays) ? j.nagDays.filter((x) => typeof x === 'string') : [],
        }
      }
    } catch { /* 没有台账 / 坏了 ⇒ 从零起 */ }
    return { enabled: cfg.enabled === true, enabledAt: null, firstSeenDay: null, nagDays: [] }
  }
  function atomicWrite(file, text) {
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.tmp-${randomUUID().slice(0, 8)}`
    writeFileSync(tmp, text, 'utf8')
    renameSync(tmp, file)
    return file
  }
  const saveState = (j) => { try { atomicWrite(stateFile(), JSON.stringify(j, null, 2)) } catch { /* 存不上不影响收信 ✗ */ } return j }

  const isEnabled = () => loadState().enabled || cfg.enabled === true

  // ── 钥匙 ────────────────────────────────────────────────────────────────
  /** ★按**信封声明的发件人**取钥：有专用钥用专用钥，没有回落共享钥 ✓ */
  function keyFor(from) {
    try {
      const p = keyOfFile(String(from))
      if (existsSync(p)) {
        const t = readFileSync(p, 'utf8').trim()
        if (/^[0-9a-f]{64}$/i.test(t)) return t.toLowerCase()
      }
    } catch { /* 读不到就回落 */ }
    try {
      if (existsSync(keyFile())) {
        const t = readFileSync(keyFile(), 'utf8').trim()
        if (/^[0-9a-f]{64}$/i.test(t)) return t.toLowerCase()
      }
    } catch { /* 没有共享钥 ⇒ 下面返回 null，判 fail-closed */ }
    return null
  }

  // ── 验签 ────────────────────────────────────────────────────────────────
  /** 摘要／签名：优先借 `bus` 的实现（同一个算法，不各算各的）✓ */
  const digestOf = (body) => (typeof cfg.bus?.digest === 'function' ? cfg.bus.digest(body) : sha256hex(body))
  /**
   * ★密钥的用法必须与 `bus.sign` **逐字节一致**（集成测试 07-10 抓出的 bug ✗）：
   *   bus 用的是 `Buffer.from(keyHex(), 'hex')` —— 把 64 位 hex **解码成 32 字节**再当 HMAC 密钥；
   *   原来这里直接拿 hex 字符串当密钥 ⇒ 两边密钥不同 ⇒ **算出来的签名永远不符**，
   *   而各自的自测都自洽（自测里造信也用字符串）⇒ **全绿但一接就炸** ✓。
   */
  const keyBuf = (key) => (/^[0-9a-f]{64}$/i.test(String(key)) ? Buffer.from(String(key), 'hex') : Buffer.from(String(key), 'utf8'))
  function macOf(env, key) {
    if (typeof cfg.bus?.sign === 'function') {
      try { return cfg.bus.sign(env) } catch { /* bus 的签名抛了 ⇒ 退回内置 */ }
    }
    const canonical = JSON.stringify(FIELD_ORDER.filter((k) => env[k] !== undefined).map((k) => [k, env[k]]))
    return createHmac('sha256', keyBuf(key)).update(canonical, 'utf8').digest('hex')
  }

  /**
   * ★核心只问这一句 ✗。
   * ★禁用时：放行，但带 `skipped: true`（★不许假装验过 ✓）。
   * ★开启时：fail-closed —— 缺字段／未登记字段／摘要不符／签名不符／不在白名单 ⇒ 一律 `ok:false`。
   */
  function verify(letter) {
    if (!isEnabled()) return { ok: true, skipped: true, why: '安全校验处于**禁用**状态（未开启 ⇒ 这封没有验过）' }
    try {
      const env = letter ?? {}
      // ① 白名单（★只在配了 allow 时才管 ✓）
      const allow = Array.isArray(cfg.allow) ? cfg.allow.map(String) : []
      if (allow.length > 0 && !allow.includes(String(env.from))) {
        return { ok: false, why: `发件人不在白名单里：${env.from}` }
      }
      // ② 必填字段（★**分 kind**：hello／ack 信封没有正文 ⇒ 没有 seq／sha256
      //    —— 口径与 bus.verify 一致；07-10 集成测试抓出的 bug：原来无条件要 sha256 ⇒
      //    一开启安全校验，连"握手（hello）"都被判不过 ⇒ 整条链发不出信 ✗）
      const base = ['v', 'kind', 'id', 'from', 'to']
      const need = env.kind === 'msg' ? [...base, 'seq', 'sha256'] : base
      for (const k of need) {
        if (env[k] === undefined || env[k] === null) return { ok: false, why: `信封缺字段：${k}` }
      }
      // ③ 不许有未登记字段（★加字段忘了进签名域＝那个字段可被随便改 ✓）
      const unknown = Object.keys(env).filter((k) => !FIELD_ORDER.includes(k) && k !== 'mac')
      if (unknown.length) return { ok: false, why: `信封里有未登记字段：${unknown.join(',')}` }
      // ④ 摘要（★只有"信"有正文 ⇒ 只对 kind==='msg' 查；hello／ack 不查 ✓）
      if (env.kind === 'msg' && digestOf(env.body ?? '') !== env.sha256) {
        return { ok: false, why: '正文摘要不符（body 被改过）' }
      }
      // ⑤ 签名
      const key = keyFor(env.from)
      if (!key) return { ok: false, why: '取不到钥匙（没有专用钥也没有共享钥）' }
      const want = macOf(env, key)
      const got = String(env.mac ?? '')
      const a = Buffer.from(want, 'utf8'); const b = Buffer.from(got, 'utf8')
      if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, why: '签名不符' }
      return { ok: true }
    } catch (err) {
      return { ok: false, why: `校验内部出错（按不过处理）：${err && err.message ? err.message : String(err)}` }
    }
  }

  // ── 状态查询与提示 ──────────────────────────────────────────────────────
  const nagText = () =>
    '【安全校验：禁用中】当前邮局**没有开启信封验签**：任何能写这只信箱目录的人都可以冒名发信。\n' +
    '建议开启，以免未知 agent 对其他 agent 发起欺骗或攻击。\n' +
    '开启方法：在 profile 的配置里给 dsh-whale-post-verify 传 enabled: true（并配好 keys/ 或 signing.key）。'

  /** ★它只回答"现在该不该印"，不替核心决定任何别的事 ✓ */
  function nag() {
    if (isEnabled()) return null
    const st = loadState()
    const today = localDay()
    if (st.firstSeenDay === null) {
      const next = saveState({ ...st, firstSeenDay: today, nagDays: [today] })
      return next.nagDays.length <= Number(cfg.nagDays) ? nagText() : null
    }
    if (st.nagDays.includes(today)) return null                      // ★今天已经提过，不再重复 ✓
    const next = saveState({ ...st, nagDays: [...st.nagDays, today] })
    return next.nagDays.length <= Number(cfg.nagDays) ? nagText() : null
  }

  function status() {
    const st = loadState()
    const today = localDay()
    const dayIndex = st.nagDays.length
    return {
      enabled: st.enabled || cfg.enabled === true,
      enabledAt: st.enabledAt,
      firstSeenDay: st.firstSeenDay,
      nagDays: [...st.nagDays],
      dayIndex,
      nagLimit: Number(cfg.nagDays),
      willNag: !isEnabled() && dayIndex < Number(cfg.nagDays),
      todayNagged: st.nagDays.includes(today),
      allowCount: Array.isArray(cfg.allow) ? cfg.allow.length : 0,
      stateFile: stateFile(),
      clockWarning,          // ★时钟取值无效时在这里出声（不静默退化 ✗）
      apiVersion,
    }
  }

  function enable() {
    const st = loadState()
    return saveState({ ...st, enabled: true, enabledAt: new Date(clockMs()).toISOString() })
  }
  function disable() {
    const st = loadState()
    return saveState({ ...st, enabled: false, enabledAt: null })
  }

  return { apiVersion, verify, nag, status, enable, disable, cfg, localDay, keyFor, digestOf, FIELD_ORDER }
}

/** 插件入口：挂进 Cordis 风格的 ctx（拿不到容器也能被 CLI 直接 import 使用 ✓） */
export function apply(ctx, config = {}) {
  const bus = ctx?.get?.('whale.bus')
  const v = createVerify({ ...config, bus })
  if (typeof ctx?.provide === 'function') ctx.provide('whale.verify', v)
  return v
}
