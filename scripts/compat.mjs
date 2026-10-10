/**
 * 跨版本兼容验收（`compat`）—— **"上一个发布的版本，跟本版能不能互通"**
 *
 * 为什么要有它 （2026-10-10 加）：
 *   上一轮我**手工**拿 `npx -y dsh-whale-post-cli@0.2.0` 跟本版对跑 ——
 *   结果抓到一处**单向不兼容**：**老版发的信本版收得到**，
 *     **而本版发的信老版会退**（它报"有**没进签名域**的字段：`peerStateAtSend`"）——
 *   **病根**：本版往**签名域**加了 7 个字段，而"**不许有未登记字段**"是**老版**的 fail-closed 纪律。
 *   **为什么必须固化**：这处不兼容**只有真跑老版才看得见** ——
 *     **所有"只测本版"的自测都照不出来** （我们所有工具都只跑本版）⇒
 *     **不固化 ⇒ 下次再加一个签名域字段，又会多一道单向墙而没人知道**。
 *
 * 判据（看**退出码**：0 过／非 0 不过）：
 *   ① **老版发的信 ⇒ 本版必须收得到** （canonical 只收"出现过的字段"⇒ 老信封照验）；
 *   ② **老版 `hello` 写的握手 ⇒ 本版认得出**；
 *   ③ **报告**（**不判红**）：本版发的信老版收不收 ——
 *      **"老版会退"是**已知**的** （已写进 `CHANGELOG` 的「必读（二）」）；
 *      **而哪天它变通了，也该被人看见** ⇒ **所以打印出来，但不拿它判红**。
 *
 * ⚠️ **它要联网** （`npx` 去 npm 拉老版，且**只拉一次**、之后走缓存）⇒
 *   **不并进 `npm run selftest`** —— **它单独跑 **（同 `racetest` 的地位），
 *   并写进 `docs/RELEASE.md` 第 0 步。
 * ⚠️ 不碰真邮局：全程**临时根**。
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')

/**
 * 要跟哪个版本对跑 —— **默认"上一个已发布版本"，动态算** 
 *
 * **为什么不能钉死 `0.2.0`** （2026-10-10 改）：那种写法**会在发布之后立刻过期** ——
 *   `0.3.0` 一发出去，"对跑老版"就变成了"跟**上上版**对跑" ⇒
 *   **而升级时真会遇到的是"相邻两版混跑"** （没人从 `0.2.0` 直接跳到 `0.4.0` 而不经过 `0.3.0`）。
 * **怎么算**：问 npm 要 `dsh-whale-post-cli` 的**版本表** ⇒
 *   取**比本仓 `package.json` 里那个版本小的、最大的一个** （＝"上一个发布"）；
 *   **问不到（离线／还没发过）⇒ 退回 `0.2.0`** 并**说明白** （不许假装算出来了）。
 * **`COMPAT_OLD` 仍然可以指定** （比如想专门验某一版）。
 */
function previousPublished() {
  if (process.env.COMPAT_OLD) return { v: process.env.COMPAT_OLD, how: '★由 COMPAT_OLD 指定 ✓' }
  const mine = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version
  try {
    const r = spawnSync('npm', ['view', 'dsh-whale-post-cli', 'versions', '--json', '--registry', 'https://registry.npmjs.org'],
      { encoding: 'utf8', shell: true, timeout: 120000 })
    const all = JSON.parse(String(r.stdout ?? '[]'))
    const cmp = (a, b) => {
      const A = String(a).split('.').map(Number); const B = String(b).split('.').map(Number)
      return (A[0] - B[0]) || (A[1] - B[1]) || (A[2] - B[2])
    }
    const lower = all.filter((v) => cmp(v, mine) < 0 && !String(v).includes('-'))
    if (lower.length) return { v: lower.sort(cmp)[lower.length - 1], how: `★npm 上比 ${mine} 小的最大者 ✓` }
    return { v: '0.2.0', how: '★npm 上没有比本版更小的了 ⇒ 退回 0.2.0（★当基线用 ✓）' }
  } catch {
    return { v: '0.2.0', how: '★问不到 npm（★离线？）⇒ 退回 0.2.0 ✓' }
  }
}
const PREV = previousPublished()
const CLIVER = PREV.v
const tmp = join(process.env.TEMP ?? '/tmp', `whale-compat-${Date.now()}`)
mkdirSync(tmp, { recursive: true })
writeFileSync(join(tmp, 'roster.json'), JSON.stringify({
  apiVersion: 1, members: [{ id: 'alice' }, { id: 'bob' }],
}, null, 2), 'utf8')

const checks = []
const check = (name, ok, extra = '') => checks.push({ name, ok: !!ok, extra: String(extra) })

/** 老版：走 `npx` 拉 npm 上那一份 （`stdio: 'ignore'` ⇒ 不看它的中文输出） */
const runOld = (args) => spawnSync('npx', ['-y', `dsh-whale-post-cli@${CLIVER}`, ...args, '--root', tmp],
  { stdio: 'ignore', shell: true, timeout: 300000 })
/** 本版：直接跑仓库里的 CLI */
const runNew = (args) => spawnSync(process.execPath, [join(repo, 'packages', 'cli', 'index.js'), ...args, '--root', tmp],
  { stdio: 'ignore', timeout: 120000 })
/** 本版的详细输出（"新发老收"那一步要看老版**说了什么**） */
const runOldVerbose = (args) => spawnSync('npx', ['-y', `dsh-whale-post-cli@${CLIVER}`, ...args, '--root', tmp],
  { encoding: 'utf8', shell: true, timeout: 300000 })

const inbox = (w) => { try { return readdirSync(join(tmp, 'inbox', w)).filter((f) => f.endsWith('.msg.json')) } catch { return [] } }
/** “我收过这封”的凭证 （`pump` 的产物，而**不是收件箱里还在不在**） */
const seenOf = (w) => { try { return readdirSync(join(tmp, 'seen', w)) } catch { return [] } }

// ── 准备：两边各自握手（老版握一个、本版握一个）
runOld(['hello', '--as', 'alice'])
runNew(['hello', '--as', 'bob'])
//   ⚠️ 注意：模板字符串里**不能再出现反引号** （我第一版就栽在这上面：
//     `check(\`① …（\`hello\` 是本版认的）\`, …)` ⇒ **`SyntaxError: missing ) after argument list`**）——
//     要提命令名就用普通引号括起来 （同一条坑今晚犯过第二次了）。
check(`① 老版（${CLIVER}）写的握手，本版**认得出** ✗（★hello 是本版认的 ✓）`,
  existsSync(join(tmp, 'hello', 'alice.json')), `看 ${join(tmp, 'hello')}`)

// ── ① 老版发 ⇒ 本版收（这一条**必须**通）
const sendOld = runOld(['send', '--as', 'alice', '--to', 'bob', '--body', `老版（${CLIVER}）发的信：正文有货，别当回执。`])
check('② 老版 send 退出码 0', sendOld.status === 0, `退出码 ${sendOld.status}`)
//   ⚠️ 判据写法踩过一次：我第一版写的是“**收件箱 +1**” —— 而 `pump` 的语义是
//     **把信收走 ＋ 留消费凭证** ⇒ **收完收件箱是空的**（实测 `1 → 0`）⇒ 判据假红。
//     正解：判 **`seen/<我>/` 里多了一份凭证** （那才是“我收过这封”的痕迹）。
const seenBefore = seenOf('bob').length
const pumpNew = runNew(['pump', '--as', 'bob'])
check('★★★老版发的信 ⇒ **本版收得下** ✗✓（★拆得开、收得下 ✓ —— ★★**而“验得过”在 `bus` 自测里单独钉一条** ✓：★“算得出”≠“验得过” ✗）',
  pumpNew.status === 0 && seenOf('bob').length > seenBefore,
  `pump 退出码 ${pumpNew.status}，消费凭证 ${seenBefore} → ${seenOf('bob').length}`)

// ── ② 本版发 ⇒ 老版收（**报告**，不判红）
const sendNew = runNew(['send', '--as', 'bob', '--to', 'alice', '--body', '本版发的信：正文有货，别当回执。'])
check('③ 本版 `send` 退出码 0', sendNew.status === 0, `退出码 ${sendNew.status}`)
//   **这里原来判错了** （2026-10-10 修 —— 而它一直在**报告一句错话**）：
//     我写的是 `inbox('alice').length > oldInboxBefore` —— 而**`pump` 会把信**消费掉**（收件箱**清空**）**
//     ⇒ **`inbox` 永远不会增长 ⇒ `reachedOld` 永远 `false`** 
//     ⇒ **于是它一直打印"老版**收不到**"** —— **而实测老版收得到**。
//   **这正是我在第 57 轮修过的**同一个坑** （"判收件箱 +1" ⇒ **该判 `seen/` 里的消费凭证**）——
//     **而这一处我漏了**。教训：**同一个形状出现第二次时，要回头把别处也扫一遍**。
const oldSeenBefore = seenOf('alice').length
const pumpOld = runOldVerbose(['pump', '--as', 'alice'])
const reachedOld = seenOf('alice').length > oldSeenBefore
console.log(`\nⓘ **报告**：本版发的信，老版（${CLIVER}）${reachedOld ? '**收得到** ✓（★两边签名域一致 ⇒ 普通信互通 ✓）' : '**收不到** ✗（★见 CHANGELOG「必读（二）」✓）'}`)
if (!reachedOld) {
  const why = String(pumpOld.stdout ?? '').split(/\r?\n/).find((l) => l.includes('未登记') || l.includes('签名域') || l.includes('退信'))
  if (why) console.log(`   老版说的是：${why.trim().slice(0, 140)}`)
}
//   **"报告"也必须**有证据** （2026-10-10 加 —— 因为这一行**错了一整个月没人发现**）：
//     **病**：上面那行"报告"**不判红** ⇒ 它就算**说错话**也没人管 ——
//       **而它确实错过**：判据写成"看 `inbox` 长度"（而 `pump` 会清空收件箱）
//       ⇒ **`reachedOld` 永远是 `false`** ⇒ 它一直报"老版收不到" —— **而实测收得到**。
//     **方**：**给"报告"配一条自洽检查** —— **既不要求"必须收得到"，也不要求"必须收不到"** 
//       （那是**事实**，不是**标准**）；只要求：**你说的那件事，现场必须有对应的痕迹**。
//     **这条判据守的不是"兼容性"，是"报告的可信度"** —— **没证据的报告，等于没报告**。
{
  const sawReceipt = seenOf('alice').length > oldSeenBefore
  const bounced = (() => { try { return readdirSync(join(tmp, '退信')).length > 0 } catch { return false } })()
  check('★★★**"报告"有证据**: 说"收得到" ⇒ `seen/` 里有凭证；说"收不到" ⇒ `退信/` 里有退信（★不许瞎写 ✓）',
    sawReceipt === reachedOld && (reachedOld || bounced),
    `reachedOld=${reachedOld} 凭证新增=${sawReceipt} 有退信=${bounced}`)
}

const pass = checks.filter((c) => c.ok).length
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  :: ' + c.extra}`)
console.log(`\n${pass}/${checks.length} 兼容   （★对跑的是 npm 上的 \`${CLIVER}\` ✓ —— ${PREV.how}；临时邮局：${tmp}）`)
try { rmSync(tmp, { recursive: true, force: true }) } catch { /* 删不掉就留着 */ }
process.exit(pass === checks.length ? 0 : 1)
