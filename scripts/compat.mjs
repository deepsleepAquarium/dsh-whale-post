/**
 * ★★★跨版本兼容验收（`compat`）✗✓ —— ★**"上一个发布的版本，跟本版能不能互通"**
 *
 * ★★为什么要有它 ✗✓（2026-10-10 加）：
 *   ★上一轮我**手工**拿 `npx -y dsh-whale-post-cli@0.2.0` 跟本版对跑 ✓ ——
 *   ★★结果抓到一处**单向不兼容** ✗✓：★**老版发的信本版收得到** ✓，
 *     ★★**而本版发的信老版会退**（★它报"有**没进签名域**的字段：`peerStateAtSend`" ✓）——
 *   ★★★★ **病根**：★本版往**签名域**加了 7 个字段 ✓，★而"**不许有未登记字段**"是**老版**的 fail-closed 纪律 ✓。
 *   ★**为什么必须固化** ✗：★这处不兼容**只有真跑老版才看得见** ✓ ——
 *     ★★**所有"只测本版"的自测都照不出来** ✗（★我们所有工具都只跑本版 ✓）⇒
 *     ★★★**不固化 ⇒ 下次再加一个签名域字段，又会多一道单向墙而没人知道** ✓✓。
 *
 * ★判据（★看**退出码** ✓：0 过／非 0 不过）✗：
 *   ① ★★**老版发的信 ⇒ 本版必须收得到** ✗✓（★canonical 只收"出现过的字段"⇒ 老信封照验 ✓）；
 *   ② ★★**老版 `hello` 写的握手 ⇒ 本版认得出** ✗✓；
 *   ③ ★**报告**（★**不判红** ✗）：★本版发的信老版收不收 ✓ ——
 *      ★★**"老版会退"是**已知**的** ✓（★已写进 `CHANGELOG` 的「必读（二）」✓）；
 *      ★★★**而哪天它变通了，也该被人看见** ✓ ⇒ ★**所以打印出来，但不拿它判红** ✓。
 *
 * ⚠️ ★**它要联网** ✗（`npx` 去 npm 拉老版 ✓，★且**只拉一次**、之后走缓存 ✓）⇒
 *   ★★**不并进 `npm run selftest`** ✓ —— ★**它单独跑 ✓**（★同 `racetest` 的地位 ✓），
 *   ★并写进 `docs/RELEASE.md` 第 0 步 ✓。
 * ⚠️ ★不碰真邮局：全程**临时根** ✓。
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')
const CLIVER = process.env.COMPAT_OLD ?? '0.2.0'          // ★要跟哪个已发布版本对跑 ✓
const tmp = join(process.env.TEMP ?? '/tmp', `whale-compat-${Date.now()}`)
mkdirSync(tmp, { recursive: true })
writeFileSync(join(tmp, 'roster.json'), JSON.stringify({
  apiVersion: 1, members: [{ id: 'alice' }, { id: 'bob' }],
}, null, 2), 'utf8')

const checks = []
const check = (name, ok, extra = '') => checks.push({ name, ok: !!ok, extra: String(extra) })

/** ★老版：走 `npx` 拉 npm 上那一份 ✓（★`stdio: 'ignore'` ⇒ 不看它的中文输出 ✓） */
const runOld = (args) => spawnSync('npx', ['-y', `dsh-whale-post-cli@${CLIVER}`, ...args, '--root', tmp],
  { stdio: 'ignore', shell: true, timeout: 300000 })
/** ★本版：直接跑仓库里的 CLI ✓ */
const runNew = (args) => spawnSync(process.execPath, [join(repo, 'packages', 'cli', 'index.js'), ...args, '--root', tmp],
  { stdio: 'ignore', timeout: 120000 })
/** ★本版的详细输出（★"新发老收"那一步要看老版**说了什么** ✓） */
const runOldVerbose = (args) => spawnSync('npx', ['-y', `dsh-whale-post-cli@${CLIVER}`, ...args, '--root', tmp],
  { encoding: 'utf8', shell: true, timeout: 300000 })

const inbox = (w) => { try { return readdirSync(join(tmp, 'inbox', w)).filter((f) => f.endsWith('.msg.json')) } catch { return [] } }
/** ★“我收过这封”的凭证 ✓（★`pump` 的产物，★而**不是收件箱里还在不在** ✓） */
const seenOf = (w) => { try { return readdirSync(join(tmp, 'seen', w)) } catch { return [] } }

// ── 准备：★两边各自握手（★老版握一个、本版握一个 ✓）
runOld(['hello', '--as', 'alice'])
runNew(['hello', '--as', 'bob'])
//   ⚠️ ★注意：★模板字符串里**不能再出现反引号** ✗（★我第一版就栽在这上面：
//     ★`check(\`① …（★\`hello\` 是本版认的 ✓）\`, …)` ⇒ ★**`SyntaxError: missing ) after argument list`** ✓）——
//     ★要提命令名就用普通引号括起来 ✓（★同一条坑今晚犯过第二次了 ✓）。
check(`① 老版（${CLIVER}）写的握手，本版**认得出** ✗（★hello 是本版认的 ✓）`,
  existsSync(join(tmp, 'hello', 'alice.json')), `看 ${join(tmp, 'hello')}`)

// ── ① 老版发 ⇒ 本版收（★这一条**必须**通 ✓）
const sendOld = runOld(['send', '--as', 'alice', '--to', 'bob', '--body', `老版（${CLIVER}）发的信：正文有货，别当回执。`])
check('② 老版 send 退出码 0', sendOld.status === 0, `退出码 ${sendOld.status}`)
//   ⚠️ ★判据写法踩过一次 ✗✓：★我第一版写的是“**收件箱 +1**” ✓ —— ★而 `pump` 的语义是
//     **把信收走 ＋ 留消费凭证** ✓ ⇒ ★**收完收件箱是空的**（★实测 `1 → 0` ✓）⇒ ★判据假红 ✓。
//     ★★正解：★判 **`seen/<我>/` 里多了一份凭证** ✓（★那才是“我收过这封”的痕迹 ✓）。
const seenBefore = seenOf('bob').length
const pumpNew = runNew(['pump', '--as', 'bob'])
check('★★★老版发的信 ⇒ **本版收得下** ✗✓（★拆得开、收得下 ✓ —— ★★**而“验得过”在 `bus` 自测里单独钉一条** ✓：★“算得出”≠“验得过” ✗）',
  pumpNew.status === 0 && seenOf('bob').length > seenBefore,
  `pump 退出码 ${pumpNew.status}，消费凭证 ${seenBefore} → ${seenOf('bob').length}`)

// ── ② 本版发 ⇒ 老版收（★**报告**，不判红 ✗）
const sendNew = runNew(['send', '--as', 'bob', '--to', 'alice', '--body', '本版发的信：正文有货，别当回执。'])
check('③ 本版 `send` 退出码 0', sendNew.status === 0, `退出码 ${sendNew.status}`)
const oldInboxBefore = inbox('alice').length
const pumpOld = runOldVerbose(['pump', '--as', 'alice'])
const reachedOld = inbox('alice').length > oldInboxBefore
console.log(`\nⓘ **报告**（★不判红 ✗）：本版发的信，老版（${CLIVER}）${reachedOld ? '**收得到** ✓（★那条单向墙没了 ⇒ 该更新 CHANGELOG 的「必读（二）」）' : '**收不到** ✗（★已知 ✓ —— ★见 CHANGELOG「必读（二）：混跑时不兼容」）'}`)
if (!reachedOld) {
  const why = String(pumpOld.stdout ?? '').split(/\r?\n/).find((l) => l.includes('未登记') || l.includes('签名域') || l.includes('退信'))
  if (why) console.log(`   老版说的是：${why.trim().slice(0, 140)}`)
}

const pass = checks.filter((c) => c.ok).length
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  :: ' + c.extra}`)
console.log(`\n${pass}/${checks.length} 兼容   （★对跑的是 npm 上的 \`${CLIVER}\` ✓；临时邮局：${tmp}）`)
try { rmSync(tmp, { recursive: true, force: true }) } catch { /* 删不掉就留着 ✓ */ }
process.exit(pass === checks.length ? 0 : 1)
