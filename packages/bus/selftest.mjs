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

  // ③ 收信：消费 ＋ ack ＋ 幂等
  const got = bus.pump({ as: 'bob' })
  check('收信：拉到 1 封', got.length === 1 && got[0].ok)
  check('收信：原信搬进 seen', existsSync(join(tmp, 'seen', 'bob', `${r.id}.msg.json`)))
  check('收信：写了 ack', ls(join(tmp, 'ack', 'alice')).length === 1)
  check('幂等：再 pump ⇒ 0 封', bus.pump({ as: 'bob' }).length === 0)

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
  const bad = bus.pump({ as: 'bob' })
  check('坏信：挪进退信并如实报告', bad.some((x) => x.ok === false && /读不成信/.test(x.why)), JSON.stringify(bad.map((x) => x.why)))
} catch (err) {
  check('自测没有抛异常', false, err && err.stack ? err.stack.split('\n')[0] : err)
}

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  :: ' + c.extra}`)
const pass = checks.filter((c) => c.ok).length
console.log(`\n${pass}/${checks.length} 通过   （临时邮局：${tmp}）`)
process.exit(pass === checks.length ? 0 : 1)
void createBus
