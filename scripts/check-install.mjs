/**
 * 装机验证：照 `docs/INSTALL.md`「一、装」那 14 条命令真装一遍，再真启一次 
 *
 * **为什么要它** （2026-10-10）：
 *   `INSTALL` 的"怎么装"原来**两条命令都是错的** （`add dsh-whale-post` ⇒ npm `E404`；
 *   `add link:<仓库根>` ⇒ **装得上而一个插件都不生效**）—— **后者比"装不上"更隐蔽**。
 *   **而当时是我用眼睛读出来的** ⇒ **下次改了还得再读一遍** ⇒ **做成脚本，改了就跑**。
 *
 * **它做什么**：建一个**一次性 profile**（从 `headless` 模板）⇒
 *   **逐条 `dsh plugin add link:<本仓>/packages/<件名>`** ⇒ **查 `bundles` 与 `dump-config`** ⇒
 *   **真启一次** ⇒ **把那个 profile 删掉**。
 *
 * ⚠️**它不会动你现有的 profile** —— 临时 profile 的名字带时间戳；
 *   **而"在跑的引擎"一个都不碰** （不重启、不 kill）。
 *
 * ★**⑧ 桌面版线（2026-10-14 加）** ✗✓：★上面 ①～⑦ 走的都是 **CLI 那条线** ✗ ——
 *   而本仓七件**声明要在两种引擎上都跑得住**（`CHANGELOG`《兼容性》一节 ✓）⇒ ★"桌面版那条线"
 *   一直没人自动看 ✗✓。⇒ ★⑧ 补上**只读**核对：★桌面版 profile 在不在、我们的件**装没装**、
 *   ★装了的**在不在 `dsh.profile.bundles` 里**（★＝启没启用 ✓）。
 *   ⓘ★**判分**：★"没装" ＝ **SKIP**（用户的自由，不算失败 ✓）；★"装了但没启用" ＝ **FAIL** ✗
 *     （★装了不启用 ＝ 白装，与 ③ 同一条病 ✓）。
 *   ⓘ★**它不能替桌面版装** ✗ —— ★桌面档归 Electron 程序独占（CLI 写它会被直接拒 ✓），
 *     ★**装那一步只能从桌面版的插件页点** ✓✓。
 *
 * 用法：`node scripts/check-install.mjs`（会真建 profile、真启一次，约 1 分钟）
 */
import { existsSync, readFileSync, rmSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const parts = ['bus', 'roster', 'types', 'deliver', 'gate', 'verify', 'cli']
const name = 'checkinstall' + Date.now().toString().slice(-6)
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profileDir = join(dshHome, 'profiles', name)

const run = (args, opts = {}) => spawnSync('dsh', args, { encoding: 'utf8', shell: true, ...opts })
let bad = 0
const say = (ok, msg, extra = '') => { console.log((ok ? '  PASS  ' : '  FAIL  ') + msg + (extra ? '  :: ' + extra : '')); if (!ok) bad++ }

try {
  // ── ① 建一个一次性 profile ──────────────────────────────────────────
  //   **必须带一个任务** —— `--from-default-profile` 建完会**直接启动** ⇒
  //     而 `headless` 要一个任务才算数（不给就报 "a task is required"）。
  run(['--profile', name, '--from-default-profile', 'headless', 'say ok'])
  say(existsSync(profileDir), '① 一次性 profile 建起来了', profileDir)

  // ── ② 照文档那七条 link: 逐个装 ────────────────────────────────────
  for (const p of parts) {
    const r = run(['plugin', '--profile', name, 'add', 'link:' + join(repo, 'packages', p)])
    const out = String(r.stdout ?? '') + String(r.stderr ?? '')
    const added = out.includes('+ dsh-whale-post-' + p)
    say(r.status === 0 && added, `② 装 packages/${p}`, added ? '' : out.split(/\r?\n/).find((l) => l.trim()) ?? '')
  }

  // ── ③ bundles 里该有六件插件（CLI 不进 bundles ⇒ 它是入口工具）──
  const pj = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
  const bundles = pj.dsh?.profile?.bundles ?? []
  const inBundles = parts.filter((p) => p !== 'cli').every((p) => bundles.includes('dsh-whale-post-' + p))
  say(inBundles, '③ 六件插件都进了 dsh.profile.bundles', bundles.join(', '))

  // ── ④ dump-config 认得它们 ─────────────────────────────────────────
  const d = run(['--profile', name, '--dump-config'])
  const dLines = String(d.stdout ?? '').split(/\r?\n/).filter((l) => l.includes('dsh-whale-post')).length
  say(d.status === 0 && dLines >= 6, '④ dump-config 认得这些包', dLines + ' 行')

  // ── ⑤ 真启（完工判据之一）──────────────────────────────────────
  //   ⚠️ **注意：真启成功**不等于**插件装上了**** （2026-10-10 负向测试当场证明的）：
  //     把 `link:` 改成指仓库根 ⇒ **装了个空壳** ⇒ **而 ⑤ 仍然 PASS**（引擎没有插件也照常启动）；
  //     **真正揭穿它的是 ③（`bundles` 里没有 whale 件）与 ④（`dump-config` 0 行）**。
  //     **所以这一条只是"没炸"，不是"装上了"** —— 两条都要看。
  const b = run(['--profile', name, 'say ok'])
  const bOut = String(b.stdout ?? '') + String(b.stderr ?? '')
  const errs = bOut.split(/\r?\n/).filter((l) => /Error|failed|registered|Cannot find/.test(l)).length
  say(b.status === 0 && errs === 0, '⑤ 真启退出码 0、没有错误行（只说明"没炸"，装没装上要看 ③④）', `退出码 ${b.status}，错误行 ${errs}`)

  // ── ⑦ 文档里的命令真跑一遍（照 `example/README.md` 第三节）────────
  //   **为什么要它** （2026-10-10）：`example/README` 那节自称"跑一次（判据：退出码）" ⇒
  //     **而"自称"要真跑才算数** —— 这一轮我手动跑通了，**而手动跑过的东西下次还得再跑** ⇒ **并进来**。
  //   **做法**：在一个**临时邮局**里照那七条走 （`--root` 指临时目录 ⇒ **不碰真数据**）。
  const mail = join(tmpdir(), 'whale-checkinstall-mail-' + Date.now())
  try {
    mkdirSync(mail, { recursive: true })
    copyFileSync(join(repo, 'example', 'roster.json'), join(mail, 'roster.json'))
    const cli = join(repo, 'packages', 'cli', 'index.js')
    const steps = [
      ['hello', '--as', 'alice', '--root', mail],
      ['hello', '--as', 'bob', '--root', mail],
      ['send', '--as', 'alice', '--to', 'bob', '--subject', '第一封', '--body', '离线件：等你来收', '--root', mail],
      ['pump', '--as', 'bob', '--root', mail],
      ['quota', '--as', 'alice', '--root', mail],
      ['send', '--as', 'alice', '--to', 'bob', '--mode', 'online', '--live', 'bob', '--subject', '要你动手', '--body', '在线件', '--root', mail],
    ]
    let failed = 0
    for (const s of steps) {
      const r = spawnSync(process.execPath, [cli, ...s], { encoding: 'utf8' })
      if (r.status !== 0) { failed++; console.log('        ' + s[0] + ' 退出码 ' + r.status + ' :: ' + String(r.stderr ?? '').split(/\r?\n/)[0]) }
    }
    say(failed === 0, '⑦ 照 example/README 第三节跑六条命令（退出码全 0）', failed ? failed + ' 条不过' : '')
  } catch (e) {
    say(false, '⑦ 跑文档命令时出错', String(e.message).slice(0, 80))
  } finally {
    try { rmSync(mail, { recursive: true, force: true }) } catch { /* 删不掉就留着 */ }
  }
} finally {
  // ── ⑥ 收摊：删掉那个一次性 profile（不留垃圾）──────────────────
  try {
    if (existsSync(profileDir) && profileDir.includes('checkinstall')) rmSync(profileDir, { recursive: true, force: true })
    const left = readdirSync(join(dshHome, 'profiles')).filter((n) => n.startsWith('checkinstall'))
    say(left.length === 0, '⑥ 一次性 profile 已清掉', left.length ? '残留：' + left.join(', ') : '')
  } catch (e) {
    say(false, '⑥ 清 profile 时出错', String(e.message).slice(0, 80))
  }
}

// ── ⑧ 桌面版线：只读核对（2026-10-14 加 · 需求「自动判断接的是 CLI 还是 desktop」）──
//   **为什么加** ✗✓：★上面 ①～⑦ 走的是 **CLI 那条线**（`dsh` 命令 ＋ `headless` 模板）✗ ——
//     而本仓七件**声明要在两种引擎上都跑得住**（★`CHANGELOG` 的《兼容性》一节 ✓：
//     桌面版／web 版；靠"只用 `ctx.provide`／`ctx.get`／`apiVersion` ＋ 不碰 `ctx.whale`
//     ＋ 不用 `inject`"保证 ✓）⇒ ★**于是"桌面版那条线"一直没人自动看** ✗✓✓。
//   **它能做什么** ✓：★**只读**核对 —— ★桌面版 profile 在不在 ✓、★我们的件**装没装** ✓、
//     ★装了的**在不在 `dsh.profile.bundles` 里**（★＝启没启用 ✓）。
//   **它不能做什么** ✗：★**替桌面版装** ✗ —— ★桌面版的 profile **归 Electron 程序独占** ✓
//     （★CLI 写它会直接被拒：★「managed exclusively by the Electron application」✓ ——
//     ★2026-10-12 本机实测过 ✓）⇒ ★**装那一步只能从桌面版的插件页点** ✓✓。
//   ⓘ **判分口径** ✗：★"**没装**"＝**SKIP**（★那是用户的自由，★不算失败 ✓）；
//     ★"**装了但没启用**"＝**FAIL** ✗（★"装了不启用"等于白装 —— 与上面 ③ 同一条病 ✓）。
const desktopDir = join(dshHome, 'profiles', 'desktop')
const plugs = parts.filter((p) => p !== 'cli')
if (!existsSync(desktopDir)) {
  console.log('  SKIP  ⑧ 桌面版线：本机没有 desktop profile（这台机器只跑 CLI 线）')
} else {
  try {
    const dj = JSON.parse(readFileSync(join(desktopDir, 'package.json'), 'utf8'))
    const ddeps = dj.dependencies ?? {}
    const dbundles = dj.dsh?.profile?.bundles ?? []
    const installed = plugs.filter((p) => Object.prototype.hasOwnProperty.call(ddeps, 'dsh-whale-post-' + p))
    const enabled = plugs.filter((p) => dbundles.includes('dsh-whale-post-' + p))
    if (installed.length === 0) {
      console.log('  SKIP  ⑧ 桌面版线：desktop profile 在，但我们六件一件都没装')
      console.log('        （★装它只能从桌面版的插件页点 ✓ —— 桌面档归程序独占，CLI 写不进去 ✗）')
    } else if (enabled.length === installed.length) {
      say(true, `⑧ 桌面版线：装 ${installed.length}/6、启用 ${enabled.length}/6（装了的都在 bundles 里 ✓）`, desktopDir)
    } else {
      const notEnabled = installed.filter((p) => !enabled.includes(p))
      say(false, `⑧ 桌面版线：装了 ${installed.length}/6、只启用 ${enabled.length}/6`, '装了但没启用：' + notEnabled.join('、') + '（★白装 ✗）')
    }
  } catch (e) {
    say(false, '⑧ 读桌面版 profile 时出错', String(e.message).slice(0, 80))
  }
}

console.log('\n  ' + (bad ? '' + bad + ' 条不过' : '全部通过（照 INSTALL 装完，真启也过）'))
process.exit(bad ? 1 : 0)
