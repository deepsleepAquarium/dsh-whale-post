/**
 * dsh-whale-post-bus 的**加载级自测**：真的 import、真的 apply、真的发一封、真的收一封。
 * 判据看退出码：0 过／非 0 不过。临时根，真数据零接触。
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { apply, createBus, apiVersion } from './index.js'
import { createRoster } from '../roster/index.js'
import { createTypes } from '../types/index.js'

const tmp = join(process.env.TEMP ?? '/tmp', `whale-bus-selftest-${Date.now()}`)
const checks = []
const check = (name, ok, extra = '') => checks.push({ name, ok: !!ok, extra: String(extra) })
const ls = (d) => { try { return readdirSync(d) } catch { return [] } }

mkdirSync(tmp, { recursive: true })
writeFileSync(join(tmp, 'roster.json'), JSON.stringify({ apiVersion: 1, members: [{ id: 'alice' }, { id: 'bob' }], groups: { all: ['alice', 'bob'] } }), 'utf8')

try {
  // ① 加载级：apply 进桩上下文，接口要挂上（★这一步能抓住"未定义常量"那类死法）
  //    ★核心不认识名字与类型 ⇒ 桩上下文里把 roster／types 两个接口喂进去（真容器里由那两个插件喂）
  const roster = createRoster({ file: join(tmp, 'roster.json') })
  const types = createTypes()
  const provided = {}
  const ctx = {
    provide: (n, v) => { provided[n] = v },
    get: (n) => ({ 'whale.roster': roster, 'whale.types': types }[n]),
  }
  const bus = apply(ctx, { root: tmp })
  check('加载级：apply() 不抛异常', !!bus)
  check('接口：ctx.provide("whale.bus") 挂上了', provided['whale.bus'] === bus)
  check('接口：apiVersion 是数字', Number.isInteger(apiVersion))
  check('接口：最小方法集齐全（send／pump／verify／hello）', ['send', 'pump', 'verify', 'hello'].every((m) => typeof bus[m] === 'function'))

  bus.hello({ as: 'alice' }); bus.hello({ as: 'bob' })

  // ② 信封：签了名、验得过、改一个字节就不过
  const r = bus.send({ as: 'alice', to: 'bob', subject: '离线件', body: '离线件：落在你信箱里，等你来收（不叫醒你）' })
  const raw = JSON.parse(readFileSync(join(tmp, 'inbox', 'bob', `${r.id}.msg.json`), 'utf8'))
  check('信封：字段齐全（v／kind／id／from／to／seq／sha256／mac）', ['v', 'kind', 'id', 'from', 'to', 'seq', 'sha256', 'mac'].every((k) => raw[k] !== undefined))
  check('信封：verify 通过', bus.verify(raw).length === 0, JSON.stringify(bus.verify(raw)))
  check('信封：改正文 ⇒ 不过', bus.verify({ ...raw, body: raw.body + 'X' }).some((x) => /摘要不符|MAC/.test(x)))
  check('信封：改 mode ⇒ 不过（模式进签名）', bus.verify({ ...raw, mode: 'online' }).some((x) => /MAC/.test(x)))

  // ★★ 安全校验的**策略**归 `whale.verify`（主人 2026-10-09 定："默认禁用"）——
  //   不装 ⇒ 照旧验签（向后兼容）；装了但禁用 ⇒ **真的跳过 HMAC**；装了且开启 ⇒ 照验
  const broken = { ...raw, body: raw.body + 'X' }        // 正文被改 ⇒ 摘要那条必然报（与策略无关）
  const mk = (v) => createBus({ root: tmp, services: { roster, types, verify: v } })
  check('策略：★没装 verify 包 ⇒ 照旧验签（改正文仍不过，向后兼容）',
    mk(undefined).verify(broken).some((x) => /摘要不符|MAC/.test(x)))
  const offProbs = mk({ verify: () => ({ ok: true, skipped: true }) }).verify(broken)
  check('★★策略：装了 verify 但**禁用** ⇒ 跳过 HMAC（★"默认禁用"真的生效）',
    !offProbs.some((x) => /MAC/.test(x)), JSON.stringify(offProbs))
  check('策略：装了 verify 且**开启**（放行）⇒ 仍做 HMAC（改正文仍不过）',
    mk({ verify: () => ({ ok: true }) }).verify(broken).some((x) => /MAC/.test(x)))
  check('策略：纯策略判不过 ⇒ 核心如实报"安全校验不过：…"',
    mk({ verify: () => ({ ok: false, why: '不在白名单里' }) }).verify(raw).some((x) => /安全校验不过/.test(x)))
  check('策略：禁用时**形状校验照旧**（禁用 ≠ 什么都不查 —— 缺字段仍要报）',
    mk({ verify: () => ({ ok: true, skipped: true }) }).verify({ ...raw, from: undefined }).some((x) => /from/.test(x)))

  // ★★"只收离线"的成员（2026-10-10 缸内口径移植）：
  //   属性名**由配置给**（offlineOnlyFlag）—— ★核心不认识任何具体属性名 ✓；
  //   对它们发在线 ⇒ 拒发（非 0 ＋ 不落信箱 ＋ 不许静默降级 ＋ 文案带出路），★且 --force 不豁免（物理约束 ≠ 闸）
  // ★★ 用**独立的临时根**做这批测试 —— 否则"发给别人在线"会往 `tmp` 的 bob 信箱里塞一封，
  //    把后面"收信：拉到 1 封"那条判据弄红 ✗（这是"乙 零副作用"的自污染版 ✓）
  const tmpOff = join(process.env.TEMP ?? '/tmp', `whale-bus-offline-${Date.now()}`)
  mkdirSync(tmpOff, { recursive: true })
  const offFile = join(tmpOff, 'roster-offline.json')
  writeFileSync(offFile, JSON.stringify({ apiVersion: 1,
    members: [{ id: 'alice' }, { id: 'bob' }, { id: 'carol' }],
    groups: { all: ['alice', 'bob', 'carol'], pair: ['alice', 'bob', 'carol'], solo: ['carol'] },
    off: ['carol'] }, null, 2), 'utf8')
  const rosterOff = createRoster({ file: offFile })
  const busOff = createBus({ root: tmpOff, services: { roster: rosterOff, types }, offlineOnlyFlag: 'off' })
  const lsInbox = (w) => ls(join(tmpOff, 'inbox', w)).length
  // ★握手（★离线也要握：协议不许"像 UDP 那样"直接发 ⇒ 否则会撞握手检查 ✗）
  busOff.hello({ as: 'alice' }); busOff.hello({ as: 'bob' }); busOff.hello({ as: 'carol' })

  const before = lsInbox('carol')
  let eOff = ''
  try { busOff.send({ as: 'alice', to: 'carol', mode: 'online', subject: 's', body: '在线件：应当被拒' }) } catch (e) { eOff = e.message }
  check('★只收离线：对它发在线 ⇒ 拒发', /只收离线/.test(eOff), eOff.slice(0, 60))
  check('★只收离线：文案带出路（--mode offline）且说明 --force 不豁免', /offline/.test(eOff) && /force/.test(eOff))
  check('★只收离线：拒发**不落信箱**（对方 inbox 没多出东西）', lsInbox('carol') === before, `${before} ⇒ ${lsInbox('carol')}`)
  check('只收离线：发**离线** ⇒ 照发', !!busOff.send({ as: 'alice', to: 'carol', mode: 'offline', subject: 's', body: '离线件：应当照发' }).id)
  check('只收离线：发**别人**在线 ⇒ 不受影响', !!busOff.send({ as: 'alice', to: 'bob', mode: 'online', subject: 's', body: '在线件：发别人' }).id)
  let eGroup = ''
  try { busOff.send({ as: 'alice', to: 'pair', mode: 'online', subject: 's', body: '在线件：发给组' }) } catch (e) { eGroup = e.message }
  check('★只收离线：发给**组**、组里有它 ⇒ 也拦（用展开后的 targets）', /只收离线/.test(eGroup), eGroup.slice(0, 60))
  let eForce = ''
  try { busOff.send({ as: 'alice', to: 'carol', mode: 'online', subject: 's', body: '在线件：force', force: true }) } catch (e) { eForce = e.message }
  check('★★只收离线：**--force 也不豁免**（物理约束 ≠ 闸）', /只收离线/.test(eForce), eForce.slice(0, 60))
  check('只收离线：**不配** offlineOnlyFlag ⇒ 在线照发（向后兼容）',
    !!createBus({ root: tmpOff, services: { roster: rosterOff, types } }).send({ as: 'alice', to: 'carol', mode: 'online', subject: 's', body: '在线件：没配就照发' }).id)
  check('只收离线：属性名换了照样工作（★属性名不进核心）',
    (() => {
      writeFileSync(join(tmpOff, 'roster-offline2.json'), JSON.stringify({ apiVersion: 1, members: [{ id: 'alice' }, { id: 'carol' }], off2: ['carol'] }), 'utf8')
      const r2 = createRoster({ file: join(tmpOff, 'roster-offline2.json') })
      let m = ''
      try { createBus({ root: tmpOff, services: { roster: r2, types }, offlineOnlyFlag: 'off2' }).send({ as: 'alice', to: 'carol', mode: 'online', subject: 's', body: 'x' }) } catch (e) { m = e.message }
      return /只收离线/.test(m)
    })())

  // ★★群发默认不到"只收离线"的成员（缸里口径：★群发默认不到它，**点名才进** ✓）
  //   ★配置给属性名 ⇒ 核心不认识它 ✓；★点名走 `has(to) ⇒ [to]`，根本不经过 group()／broadcast() ✓
  const busGa = createBus({ root: tmpOff, services: { roster: createRoster({ file: offFile, groupWithout: 'off' }), types } })
  const rAll = busGa.send({ as: 'alice', to: 'all', mode: 'offline', subject: 's', body: '群发：整份名单' })
  check('★群发（all）：默认不到"只收离线"的成员', !rAll.targets.includes('carol') && rAll.targets.includes('bob'), JSON.stringify(rAll.targets))
  check('★★群发：**点名**照样到（"点名才进"）', busGa.send({ as: 'alice', to: 'carol', mode: 'offline', subject: 's', body: '点名：应当到' }).targets.includes('carol'))
  const rPair = busGa.send({ as: 'alice', to: 'pair', mode: 'offline', subject: 's', body: '群发：按组' })
  check('★群发（按组）：默认也不到它', !rPair.targets.includes('carol') && rPair.targets.includes('bob'), JSON.stringify(rPair.targets))
  // ★★剔完之后组空了 ⇒ 拒发（★上游已有的保护："不往名单外的信箱投信"✓ ——
  //   它顺带覆盖了"群发剔完就没人"这种情形：宁可拒发，也不发一封没有收件人的信 ✗）
  let eSolo = ''
  try { busGa.send({ as: 'alice', to: 'solo', mode: 'offline', subject: 's', body: '群发：剔完就空' }) } catch (e) { eSolo = e.message }
  check('★群发：剔完组里没人 ⇒ 拒发（不投空信）', /没有已知成员/.test(eSolo), eSolo.slice(0, 50))
  check('群发：没配 groupWithout ⇒ 谁都到（向后兼容）',
    createBus({ root: tmpOff, services: { roster: createRoster({ file: offFile }), types } }).send({ as: 'alice', to: 'all', mode: 'offline', subject: 's', body: '群发：没配' }).targets.includes('carol'))

  // ③ 收信：消费 ＋ ack ＋ 幂等（★要声明 reader：CLI 把信打到终端时才敢消费）
  const got = bus.pump({ as: 'bob', reader: true })
  check('收信：拉到 1 封', got.length === 1 && got[0].ok)
  check('收信：原信搬进 seen', existsSync(join(tmp, 'seen', 'bob', `${r.id}.msg.json`)))
  check('收信：写了 ack', ls(join(tmp, 'ack', 'alice')).length === 1)
  check('幂等：再 pump ⇒ 0 封', bus.pump({ as: 'bob', reader: true }).length === 0)

  // ④ keep：原样留在信箱（不消费）
  const r2 = bus.send({ as: 'alice', to: 'bob', subject: '第二封', body: '第二封：用来验证 keep 不消费（正文有货）' })
  const kept = bus.pump({ as: 'bob', keep: true })
  check('keep：拉到信但不消费（原信还在信箱）', kept.length === 1 && existsSync(join(tmp, 'inbox', 'bob', `${r2.id}.msg.json`)))

  // ⑤ 拒发：空正文／mode 写错／未知收件人／没握手
  const fails = []
  const expectThrow = (label, fn, re) => { try { fn(); fails.push(`${label}：没拒`) } catch (e) { if (!re.test(e.message)) fails.push(`${label}：拒了但理由不对（${e.message.slice(0, 40)}）`) } }
  expectThrow('空正文', () => bus.send({ as: 'alice', to: 'bob', subject: 'x', body: '  ' }), /正文为空/)
  expectThrow('mode 写错', () => bus.send({ as: 'alice', to: 'bob', mode: 'ONLINE', subject: 'x', body: '正文有货' }), /mode 取值非法/)
  expectThrow('未知收件人', () => bus.send({ as: 'alice', to: 'nobody', subject: 'x', body: '正文有货' }), /未知收件人/)
  expectThrow('没握手', () => bus.send({ as: 'alice', to: 'carol', subject: 'x', body: '正文有货', force: false }), /未知收件人/)
  check('拒发：四条非法输入都当场挡住', fails.length === 0, fails.join('；'))

  // ⑥ 握手闸：对方没有新鲜 hello ⇒ 拒（--force 才放行）
  writeFileSync(join(tmp, 'roster.json'), JSON.stringify({ apiVersion: 1, members: [{ id: 'alice' }, { id: 'bob' }, { id: 'dave' }], groups: {} }), 'utf8')
  let helloReject = ''
  try { bus.send({ as: 'alice', to: 'dave', subject: 'x', body: '对方没握手就该拒（正文有货）' }) } catch (e) { helloReject = e.message }
  check('握手闸：没握过手 ⇒ 拒发', /未与 dave 建立握手/.test(helloReject), helloReject)
  check('握手闸：--force 可以强发（收信侧只认签名）', !!bus.send({ as: 'alice', to: 'dave', force: true, subject: 'x', body: '强发：绕过握手但照旧签名（正文有货）' }).id)

  // ⑦ 坏信：挪进"退信"，不炸
  writeFileSync(join(tmp, 'inbox', 'bob', 'garbage.msg.json'), '{ 这不是 JSON', 'utf8')
  const bad = bus.pump({ as: 'bob', reader: true })
  check('坏信：挪进退信并如实报告', bad.some((x) => x.ok === false && /读不成信/.test(x.why)), JSON.stringify(bad.map((x) => x.why)))
  // ⑧ ★★收信侧闭环（独立复核抓出）：**没有读者 ⇒ 不消费** —— 这一条是"信不丢"的收信侧那一半
  const nr = join(tmp, 'no-reader')
  const bus2 = createBus({ root: nr, services: { roster } })        // ★故意不给 sessionOf／deliver
  bus2.hello({ as: 'alice' }); bus2.hello({ as: 'bob' })
  const r3 = bus2.send({ as: 'alice', to: 'bob', subject: '没人读', body: '收件人此刻没有读者：这封信必须留在信箱里（不投也不消费）' })
  const got3 = bus2.pump({ as: 'bob' })                              // ★不传 reader ⇒ 默认"没有读者就不消费"
  check('收信侧闭环：没有读者 ⇒ 不消费（kept）', got3.length === 1 && got3[0].kept === true, JSON.stringify(got3.map((x) => x.why)))
  check('收信侧闭环：信仍在 inbox 里', existsSync(join(nr, 'inbox', 'bob', `${r3.id}.msg.json`)))
  check('收信侧闭环：seen 里没有它、也没写 ack', ls(join(nr, 'seen', 'bob')).length === 0 && ls(join(nr, 'ack', 'alice')).length === 0,
    JSON.stringify({ seen: ls(join(nr, 'seen', 'bob')), ack: ls(join(nr, 'ack', 'alice')) }))
  const got4 = bus2.pump({ as: 'bob', reader: true })                // ★声明"我就是读者"（CLI 把信打到终端）⇒ 这次才消费
  check('收信侧闭环：声明是读者 ⇒ 才消费（搬进 seen）', got4.length === 1 && got4[0].kept === false && existsSync(join(nr, 'seen', 'bob', `${r3.id}.msg.json`)))

  // ⑨ ★签名 fail-closed（独立复核建议）：没进签名域的字段 ⇒ 拒（防"加了字段忘进 FIELD_ORDER"）
  check('签名：未知字段 ⇒ 验不过（fail-closed）', bus.verify({ ...raw, urgent: true }).some((x) => /没进签名域/.test(x)))
  check('签名：seal() 收到未登记字段 ⇒ 当场抛', (() => { try { bus.seal({ ...raw, urgent: true }); return false } catch { return true } })())

  // ⑩ ★`inject` 必须**名副其实**（独立复核 2026-10-05 抓的"同族小陷阱"）：
  //    给了 inject ⇒ 真的被调用；★它抛异常 ⇒ **不消费**（信留在信箱）；返回的 body 与原件逐字节一致
  const inj = join(tmp, 'inject')
  const bus3 = createBus({ root: inj, services: { roster } })
  bus3.hello({ as: 'alice' }); bus3.hello({ as: 'bob' })
  const r4 = bus3.send({ as: 'alice', to: 'bob', subject: '注入', body: '这封信要真的交给 inject 回调（正文有货，不是回执）' })
  const seenByInject = []
  const got5 = bus3.pump({ as: 'bob', inject: (env) => { seenByInject.push(env) } })
  check('inject：被调用**恰好一次**', seenByInject.length === 1 && got5[0].injected === true, JSON.stringify({ calls: seenByInject.length, row: got5[0] }))
  check('inject：拿到的是**完整信封**（body 与原件逐字节一致）', seenByInject[0]?.body === JSON.parse(readFileSync(join(inj, 'seen', 'bob', `${r4.id}.msg.json`), 'utf8')).body)
  check('inject：交给读者后才消费（搬进 seen）', got5[0].kept === false && existsSync(join(inj, 'seen', 'bob', `${r4.id}.msg.json`)))
  const r5 = bus3.send({ as: 'alice', to: 'bob', subject: '注入会炸', body: '注入回调抛异常时：**不消费**，信必须留在信箱里（正文有货）' })
  const got6 = bus3.pump({ as: 'bob', inject: () => { throw new Error('会话炸了') } })
  check('inject：**抛异常 ⇒ 不消费**（信留在 inbox）', got6.length === 1 && got6[0].kept === true && existsSync(join(inj, 'inbox', 'bob', `${r5.id}.msg.json`)),
    JSON.stringify({ kept: got6[0]?.kept, why: got6[0]?.why }))
  check('inject：抛异常那封**没搬 seen、也没写 ack**', !existsSync(join(inj, 'seen', 'bob', `${r5.id}.msg.json`)) && ls(join(inj, 'ack', 'alice')).length === 1,
    JSON.stringify({ seenHasIt: existsSync(join(inj, 'seen', 'bob', `${r5.id}.msg.json`)), ackCount: ls(join(inj, 'ack', 'alice')).length }))
  // ★有活体会话**不等于**信交到了读者手里 ⇒ 没人声明读者时，仍不许消费
  const bus4 = createBus({ root: join(tmp, 'live-but-no-reader'), services: { roster }, probes: { sessionOf: () => ({ live: true }) } })
  bus4.hello({ as: 'alice' }); bus4.hello({ as: 'bob' })
  const r6 = bus4.send({ as: 'alice', to: 'bob', subject: '会话活着', body: '会话活着但没人声明读者：这封信仍不该被消费（正文有货）' })
  const got7 = bus4.pump({ as: 'bob' })
  check('会话活着 ≠ 交到读者手里 ⇒ 没有读者仍不消费', got7[0]?.kept === true && existsSync(join(tmp, 'live-but-no-reader', 'inbox', 'bob', `${r6.id}.msg.json`)), JSON.stringify(got7[0]))

  // ⑪ ★独立审计（2026-10-05）抓出的四处，各配一条判据守着 —— 这些正是"信会丢／会重"的所在
  //   (a) `.recent` 不许指数膨胀（否则闸的"同对 N 分钟 M 封"失真）
  const rc = join(tmp, 'recent-cap')
  const bus5 = createBus({ root: rc, services: { roster } })
  mkdirSync(join(rc, 'inbox', 'carol'), { recursive: true })      // carol 在临时邮局里还没有信箱 ⇒ 现造一个
  bus5.hello({ as: 'alice' }); bus5.hello({ as: 'bob' })
  for (let i = 1; i <= 5; i++) {
    bus5.send({ as: 'alice', to: 'bob', mode: 'online', force: true, subject: `第${i}封`, body: `第 ${i} 封：只用来数 recent 条数（正文有货，不是回执）` })
  }
  const st5 = bus5.loadState('alice')
  check('recent 不许膨胀：发 5 封后 recent ≤ 6', (st5.recent ?? []).length <= 6, JSON.stringify({ recent: (st5.recent ?? []).length }))
  //   (b) 别人掉进我信箱的信 ⇒ 进"退信"，不许我消费、不许我回执
  const foreign = bus5.send({ as: 'alice', to: 'bob', subject: '给 bob 的', body: '这封信本来是给 bob 的（正文有货）' })
  writeFileSync(join(rc, 'inbox', 'carol', `${foreign.id}.msg.json`), JSON.stringify(foreign.env, null, 2), 'utf8')
  const gotForeign = bus5.pump({ as: 'carol', reader: true })
  check('收件人核对：不是给我的信 ⇒ 进"退信"、不消费、不回执',
    gotForeign.length === 1 && gotForeign[0].ok === false && /不是给你的/.test(gotForeign[0].why) && !existsSync(join(rc, 'ack', 'alice', `${foreign.id}.carol.ack.json`)),
    JSON.stringify(gotForeign.map((x) => x.why)))
  //   (c) `hello` 信封不是信 ⇒ 也不许被当信消费
  writeFileSync(join(rc, 'inbox', 'carol', 'hello-alice.msg.json'), JSON.stringify(bus5.hello({ as: 'alice' }), null, 2), 'utf8')
  const gotHello = bus5.pump({ as: 'carol', reader: true })
  check('kind 核对：hello 信封 ⇒ 进"退信"、不当信消费', gotHello.some((x) => x.ok === false && /不是一封信/.test(x.why)), JSON.stringify(gotHello.map((x) => x.why)))
  //   (d) 篡改过的信 ⇒ 验签必须拦住（这条让"pump 跳过 verify"立刻变红）
  const honest = bus5.send({ as: 'alice', to: 'bob', subject: '原件', body: '正常的一封信（正文有货，不是回执）' })
  const tamperFile = join(rc, 'inbox', 'bob', `${honest.id}.msg.json`)
  const tamperEnv = JSON.parse(readFileSync(tamperFile, 'utf8'))
  tamperEnv.body = tamperEnv.body + '（被人改过）'
  writeFileSync(tamperFile, JSON.stringify(tamperEnv, null, 2), 'utf8')
  const gotTamper = bus5.pump({ as: 'bob', reader: true })
  check('验签：被改过的信 ⇒ 进"退信"、不消费', gotTamper.some((x) => x.ok === false && /摘要不符|MAC/.test(x.why)), JSON.stringify(gotTamper.map((x) => x.why)))
  //   (e) 已消费的信**被重新投回** ⇒ 靠 `seen/` 目录认出来（不许二次交付）
  const again = bus5.send({ as: 'alice', to: 'bob', subject: '再投一次', body: '先正常消费一次，再把原件拷回信箱（正文有货）' })
  bus5.pump({ as: 'bob', reader: true })
  writeFileSync(join(rc, 'inbox', 'bob', `${again.id}.msg.json`), JSON.stringify(again.env, null, 2), 'utf8')
  const gotAgain = bus5.pump({ as: 'bob', reader: true })
  check('幂等：已消费的信被重投 ⇒ dup＝true（seen/ 目录是永久证据）', gotAgain.length === 1 && gotAgain[0].dup === true, JSON.stringify(gotAgain[0]))
  //   (f) 被拒发不许烧序号（水位要与真实发信量对得上）—— 用**带闸**的独立邮局验，闸只留回执闸
  const rc2 = join(tmp, 'seq-watermark')
  const { createGate } = await import('../gate/index.js')
  const bus6 = createBus({ root: rc2, services: { roster, gate: createGate({ root: rc2, loop: { pairMax: 99, hopMax: 99 } }) } })
  bus6.hello({ as: 'alice' }); bus6.hello({ as: 'bob' })
  bus6.send({ as: 'alice', to: 'bob', subject: '第一封', body: '正常的一封：让水位从 2 开始（正文有货，不是回执）' })
  const seqBefore = bus6.loadState('alice').nextSeq
  let refused = ''
  try { bus6.send({ as: 'alice', to: 'bob', subject: 'x', body: '收到' }) } catch (e) { refused = e.message }
  check('拒发不烧序号：被闸拒掉的信 ⇒ 水位不变', /闸拒发/.test(refused) && bus6.loadState('alice').nextSeq === seqBefore,
    JSON.stringify({ refused: refused.slice(0, 30), before: seqBefore, after: bus6.loadState('alice').nextSeq }))
  //   (g) 老信（没有 mode 字段）不许被标成"[在线]"
  const legacyBody = '老信：没有 mode 字段（向后兼容测试，正文有货，不是回执）'
  const legacy = bus5.seal({ v: 1, kind: 'msg', id: `legacy-${Date.now()}`, from: 'alice', to: 'bob', seq: 0, subject: '老信封', body: legacyBody, sha256: bus5.digest(legacyBody), sentAtMs: Date.now() })
  writeFileSync(join(rc, 'inbox', 'bob', `${legacy.id}.msg.json`), JSON.stringify(legacy, null, 2), 'utf8')
  const gotLegacy = bus5.pump({ as: 'bob', reader: true })
  check('老信：没标 mode 的标成"[旧信·未标模式]"（不冒充在线件）',
    gotLegacy.some((x) => String(x.handled ?? '').startsWith('[旧信·未标模式]')), JSON.stringify(gotLegacy.map((x) => x.handled)))
  // ⑫ ★"核心不认识任何类型标识" ⇒ 默认类型必须是**配置**，不是写死在核心里的常量（独立审计 2026-10-05）
  check('类型：显式给 ⇒ 用它', (() => {
    const b = createBus({ root: join(tmp, 'type-explicit'), services: { roster } })
    b.hello({ as: 'alice' }); b.hello({ as: 'bob' })
    return b.send({ as: 'alice', to: 'bob', type: 'club', subject: 'x', body: '显式类型：应当照用（正文有货，不是回执）' }).type === 'club'
  })())
  check('类型：没给 ＋ 没配默认（defaultType: null）⇒ **拒发**（不替调用方猜）', (() => {
    const b = createBus({ root: join(tmp, 'type-none'), defaultType: null, services: { roster } })
    b.hello({ as: 'alice' }); b.hello({ as: 'bob' })
    try { b.send({ as: 'alice', to: 'bob', subject: 'x', body: '没写类型又没有默认类型 ⇒ 应当拒（正文有货）' }); return false } catch (e) { return /没写类型/.test(e.message) }
  })())
  check('类型：配了默认 ⇒ 用它', (() => {
    const b = createBus({ root: join(tmp, 'type-default'), defaultType: 'club', services: { roster } })
    b.hello({ as: 'alice' }); b.hello({ as: 'bob' })
    return b.send({ as: 'alice', to: 'bob', subject: 'x', body: '配了默认类型 club ⇒ 应当用它（正文有货，不是回执）' }).type === 'club'
  })())
} catch (err) {
  check('自测没有抛异常', false, err && err.stack ? err.stack.split('\n')[0] : err)
}

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  :: ' + c.extra}`)
const pass = checks.filter((c) => c.ok).length
console.log(`\n${pass}/${checks.length} 通过   （临时邮局：${tmp}）`)
process.exit(pass === checks.length ? 0 : 1)
void createBus
